/**
 * JobsLake core: the one implementation of search, source testing and refresh. The REST API, the
 * streaming endpoint, the MCP adapter, the admin playground and WonderJobs' scheduled searches all
 * call these functions — no adapter has its own search logic (spec §37).
 *
 * Every event and count reflects work that actually happened: a source is "completed" when its
 * connector returned, a duplicate is counted when canonicalization merged it, and a failing source
 * is recorded and reported without failing the search (spec §44).
 */
import { randomBytes } from "node:crypto";
import type { Job } from "@/domain/jobs/types";
import { canonicalize, mergeWithWarm, normalizeUrl, type Observation } from "@/domain/jobslake/canonical";
import { summarizeHealth, type SourceHealth, type SourceRun } from "@/domain/jobslake/health";
import { planSearch, type Depth, type SearchPlan } from "@/domain/jobslake/planner";
import { PROTOCOL_VERSION, validateOpportunity, type CanonicalOpportunity, type SearchEvent, type SearchRequest, type SearchResponse, type SourceOutcome, type SourceSearchStatus } from "@/domain/jobslake/protocol";
import { matchesLocations, matchesQuery } from "@/services/jobs/normalize";
import { DestinationBlockedError } from "./safeFetch";
import { isAvailable, listSources, NeedsSetupError, runConnector } from "./registry";
import { jobsLakeStore } from "./store";
import { jobsLakeFlags } from "./flags";
import type { SourceRecord, TestReport } from "./types";

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

/* ----------------------------------------------------------------- audit */

export async function audit(actor: string, action: string, sourceId?: string, detail?: Record<string, unknown>) {
  await jobsLakeStore().appendAudit({ at: new Date().toISOString(), actor, action, sourceId, detail });
}

/* ---------------------------------------------------------------- health */

export async function healthBySource(sinceDays = 7): Promise<Record<string, SourceHealth>> {
  const runs = await jobsLakeStore().listRuns({ sinceIso: new Date(Date.now() - sinceDays * 86_400_000).toISOString(), limit: 5000 });
  const ids = [...new Set(runs.map((r) => r.sourceId))];
  return Object.fromEntries(ids.map((id) => [id, summarizeHealth(id, runs)]));
}

/* --------------------------------------------------------------- helpers */

const BUDGET: Record<Depth, number> = { shallow: 9_000, normal: 14_000, deep: 22_000 };

class TimeoutError extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`No response within ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const basicValid = (j: Job) => !!j.title && !!j.company && j.company !== "Unknown company" && normalizeUrl(j.applyUrl) !== null && !Number.isNaN(Date.parse(j.postedAt));

function classify(e: unknown): { outcome: SourceOutcome; code: string; message: string } {
  if (e instanceof TimeoutError) return { outcome: "timeout", code: "SOURCE_TIMEOUT", message: e.message };
  if (e instanceof NeedsSetupError || (e as { code?: string })?.code === "SOURCE_NEEDS_SETUP") return { outcome: "needs_setup", code: "SOURCE_NEEDS_SETUP", message: e instanceof Error ? e.message : "Needs setup" };
  if (e instanceof DestinationBlockedError) return { outcome: "unavailable", code: "DESTINATION_BLOCKED", message: e.message };
  return { outcome: "unavailable", code: "SOURCE_UNAVAILABLE", message: e instanceof Error ? e.message.slice(0, 200) : "Unavailable" };
}

/** The candidate-safe version of a source status: category-level messages only. */
export function publicStatus(s: SourceSearchStatus): SourceSearchStatus {
  const msg: Record<SourceOutcome, string | undefined> = { ok: undefined, empty: "No matching jobs on this source", needs_setup: "Needs setup", timeout: "Didn't respond in time", unavailable: "Temporarily unavailable", skipped: s.message };
  return { sourceId: s.sourceId, sourceName: s.sourceName, outcome: s.outcome, retrieved: s.retrieved, durationMs: s.durationMs, message: msg[s.outcome] };
}

/** Which JobsLake sources a request may use: the candidate's own legacy choices, plus platform-managed sources. */
function allowedIds(sources: SourceRecord[], req: SearchRequest): string[] | undefined {
  if (!req.sourceIds?.length) return undefined;
  const wanted = new Set(req.sourceIds);
  return sources.filter((s) => wanted.has(s.id) || (s.legacySourceId ? wanted.has(s.legacySourceId) : true)).map((s) => s.id);
}

/** Opportunities in the warm pool that fit this search, from sources this search may use. */
/** Runs a store write/read that a search can do without; logs (no candidate data) and returns undefined on failure. */
async function bookkeeping<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[jobslake] could not ${what}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function warmCandidates(req: SearchRequest, allowed: Set<string> | null): Promise<CanonicalOpportunity[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const pool = await jobsLakeStore().listOpportunities({ sinceIso: since, limit: 3000 });
  return pool.filter((o) => {
    if (allowed && !o.sourceRecords.some((r) => allowed.has(r.sourceId))) return false;
    const proj = { title: o.title, description: o.description, tags: o.enrichment.tags, skills: o.skills, location: o.locations[0] ?? "", workMode: o.workplaceType, country: o.country };
    return matchesQuery(proj, req.query.text) && matchesLocations(proj, req.query.locations);
  });
}

function applyFilters(opps: CanonicalOpportunity[], req: SearchRequest) {
  const f = req.filters ?? {};
  return opps.filter((o) => (f.freshnessDays == null || o.freshness.ageDays <= f.freshnessDays) && (!f.workplaceTypes?.length || f.workplaceTypes.includes(o.workplaceType)));
}

/* ---------------------------------------------------------------- search */

export interface SearchOptions {
  trigger: SourceRun["trigger"];
  emit?: (e: SearchEvent) => void;
  signal?: AbortSignal;
}

export async function search(req: SearchRequest, opts: SearchOptions): Promise<{ response: SearchResponse; plan: SearchPlan }> {
  const store = jobsLakeStore();
  const flags = jobsLakeFlags();
  const requestId = newId("req");
  const emit = opts.emit ?? (() => undefined);
  const sources = await listSources();
  const allowed = allowedIds(sources, req);
  const health = await healthBySource();
  const plannable = await Promise.all(sources.map(async (s) => ({ id: s.id, name: s.name, status: s.status, available: await isAvailable(s), geography: s.geography })));
  const plan = planSearch({ ...req, sourceIds: allowed }, plannable, health);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const planned = plan.waves.flat();
  emit({ type: "search_started", requestId, plannedSources: planned.map((p) => ({ id: p.id, name: p.name })), searchMode: req.searchMode });

  const criteria = { query: req.query.text, locations: req.query.locations };
  const observations: Observation[] = [];
  const statuses: SourceSearchStatus[] = [];
  const runs: SourceRun[] = [];
  const jobsBySource = new Map<string, Job[]>();
  let retrieved = 0;

  const runOne = async (sourceId: string) => {
    const src = byId.get(sourceId)!;
    emit({ type: "source_started", sourceId, sourceName: src.name });
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let status: SourceSearchStatus;
    try {
      const r = await withTimeout(runConnector(src, criteria, plan.depth), Math.min(src.limits.timeoutMs, BUDGET[plan.depth]));
      const jobs = r.jobs.slice(0, src.limits.maxResults);
      jobsBySource.set(sourceId, jobs);
      for (const job of jobs) observations.push({ source: src, job });
      retrieved += jobs.length;
      status = { sourceId, sourceName: src.name, outcome: jobs.length ? "ok" : "empty", retrieved: jobs.length, durationMs: Date.now() - started, message: r.warnings.length ? `${r.warnings.length} board(s) failed: ${r.warnings.slice(0, 2).join("; ")}` : undefined };
      emit({ type: "jobs_retrieved", sourceId, count: jobs.length, totalRetrieved: retrieved });
    } catch (e) {
      const c = classify(e);
      status = { sourceId, sourceName: src.name, outcome: c.outcome, retrieved: 0, durationMs: Date.now() - started, message: c.message };
      runs.push({ id: newId("run"), sourceId, trigger: opts.trigger, requestId, startedAt, durationMs: status.durationMs, outcome: c.outcome, retrieved: 0, valid: 0, duplicates: 0, errorCode: c.code, message: c.message });
      statuses.push(status);
      emit({ type: "source_completed", status });
      return;
    }
    runs.push({ id: newId("run"), sourceId, trigger: opts.trigger, requestId, startedAt, durationMs: status.durationMs, outcome: status.outcome, retrieved: status.retrieved, valid: (jobsBySource.get(sourceId) ?? []).filter(basicValid).length, duplicates: 0, message: status.message });
    statuses.push(status);
    emit({ type: "source_completed", status });
  };

  for (let w = 0; w < plan.waves.length; w++) {
    if (opts.signal?.aborted) break;
    const wave = plan.waves[w];
    // Bounded parallelism within a wave.
    for (let i = 0; i < wave.length; i += 4) await Promise.all(wave.slice(i, i + 4).map((p) => runOne(p.id)));
    const soFar = canonicalize(observations);
    emit({ type: "dedupe_progress", unique: soFar.opportunities.length, duplicates: soFar.duplicates });
    // Stop widening when there's already plenty — except in maximum coverage, which always goes wide.
    if (req.searchMode !== "maximum_coverage" && w < plan.waves.length - 1 && soFar.opportunities.length >= req.limit * 2) {
      for (const p of plan.waves.slice(w + 1).flat()) statuses.push({ sourceId: p.id, sourceName: p.name, outcome: "skipped", retrieved: 0, durationMs: 0, message: `Enough results after wave ${w + 1}` });
      break;
    }
  }

  // Report sources in plan order, not in whatever order they happened to finish.
  const order = new Map(planned.map((p, i) => [p.id, i]));
  statuses.sort((a, b) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0));
  const canon = canonicalize(observations);
  const valid =canon.opportunities.filter((o) => validateOpportunity(o).length === 0);
  // Duplicates per source = its records that another, stronger source's record represents.
  for (const run of runs) run.duplicates = canon.opportunities.reduce((n, o) => n + o.sourceRecords.filter((r) => r.sourceId === run.sourceId && !r.canonical).length, 0);
  // Run history and the warm pool are bookkeeping around live results the sources already returned:
  // a failed write is logged for operators, never turned into a failed search for the candidate.
  await bookkeeping("record runs", () => store.recordRuns(runs));

  let results = valid;
  let warmCount = 0;
  if (flags.jobsLakeWarmPoolEnabled) {
    if (valid.length) await bookkeeping("update the warm pool", () => store.upsertOpportunities(valid));
    if (plan.useWarmPool) {
      const warm = await bookkeeping("read the warm pool", () => warmCandidates(req, allowed ? new Set(allowed) : null));
      const merged = mergeWithWarm(valid, warm ?? []);
      results = merged.results;
      warmCount = merged.warm;
    }
  }
  results = applyFilters(results, req).slice(0, req.limit);

  const response: SearchResponse = {
    requestId,
    protocolVersion: PROTOCOL_VERSION,
    searchMode: req.searchMode,
    results,
    sources: statuses,
    metadata: {
      retrieved,
      normalized: canon.normalized,
      duplicates: canon.duplicates,
      unique: canon.opportunities.length,
      sourcesPlanned: planned.length,
      sourcesSucceeded: statuses.filter((s) => s.outcome === "ok" || s.outcome === "empty").length,
      sourcesFailed: statuses.filter((s) => s.outcome === "timeout" || s.outcome === "unavailable" || s.outcome === "needs_setup").length,
      warm: warmCount,
      live: valid.length,
    },
  };
  emit({ type: "search_completed", response });
  return { response, plan };
}

/* ------------------------------------------------------------------ test */

/** Share of a test's records that must pass the protocol validator for the source to pass. */
export const MIN_VALID_SHARE = 0.9;

/**
 * Admin Test (spec §26 step 3): a real fetch through the source's connector, validated against the
 * protocol. Only checks that actually ran are reported — nothing is ticked for show.
 */
export async function testSource(src: SourceRecord, actor: string): Promise<TestReport> {
  const started = Date.now();
  const checks: TestReport["checks"] = [];
  const store = jobsLakeStore();
  let report: TestReport;
  try {
    const r = await withTimeout(runConnector(src, { query: "", locations: [] }, "normal"), Math.max(src.limits.timeoutMs, 15_000));
    checks.push({ label: "Connection", ok: true, detail: `Responded in ${((Date.now() - started) / 1000).toFixed(1)}s` });
    if (src.secretRef) checks.push({ label: "Authentication", ok: true, detail: "Credential accepted" });
    if (r.mapping) {
      const { validateMapping } = await import("@/domain/jobslake/mapping");
      const cfg = src.config.kind === "json_api" ? src.config.api.mapping : src.config.kind === "mcp" ? src.config.mcp.mapping : undefined;
      if (cfg) for (const c of validateMapping(cfg, r.mapping).checks) checks.push(c);
    }
    checks.push({ label: "Jobs returned", ok: r.jobs.length > 0, detail: `${r.jobs.length} jobs` });
    const canon = canonicalize(r.jobs.map((job) => ({ source: src, job })));
    const invalid = canon.opportunities.map((o) => ({ o, issues: validateOpportunity(o) })).filter((x) => x.issues.length);
    const validCount = canon.opportunities.length - invalid.length;
    // Records that fail validation are never served — search drops them — so a few don't block a
    // source (spec §26: "1,842 discovered, 1,799 valid"). A source whose records mostly fail does.
    const reasons = [...new Set(invalid.flatMap((x) => x.issues.map((i) => `${i.field} ${i.problem}`)))].slice(0, 3).join("; ");
    const validShare = canon.opportunities.length ? validCount / canon.opportunities.length : 0;
    checks.push({ label: "Protocol v1 validation", ok: validCount > 0 && validShare >= MIN_VALID_SHARE, detail: invalid.length ? `${validCount} of ${canon.opportunities.length} valid; ${invalid.length} left out (${reasons})${validShare >= MIN_VALID_SHARE ? "" : ` — at least ${MIN_VALID_SHARE * 100}% must be valid`}` : `${validCount} of ${canon.opportunities.length} valid` });
    const urlOk = canon.opportunities.filter((o) => o.quality.validApplyUrl).length;
    checks.push({ label: "Apply URLs", ok: urlOk > 0 && urlOk / canon.opportunities.length >= MIN_VALID_SHARE, detail: `${urlOk} of ${canon.opportunities.length} valid` });
    // Potential duplicates: postings the warm pool already holds from another source.
    const pool = await store.listOpportunities({ limit: 5000 });
    const poolUrls = new Set(pool.filter((o) => !o.sourceRecords.some((x) => x.sourceId === src.id)).map((o) => normalizeUrl(o.canonicalApplyUrl)));
    const dupes = canon.opportunities.filter((o) => poolUrls.has(normalizeUrl(o.canonicalApplyUrl))).length + canon.duplicates;
    if (r.warnings.length) checks.push({ label: "Partial failures", ok: false, detail: r.warnings.slice(0, 3).join("; ") });
    const ok = checks.every((c) => c.ok);
    report = { at: new Date().toISOString(), ok, durationMs: Date.now() - started, checks, discovered: r.jobs.length, valid: validCount, duplicates: dupes, sampleTitles: canon.opportunities.slice(0, 5).map((o) => `${o.title} · ${o.employer.name}`) };
    await store.recordRuns([{ id: newId("run"), sourceId: src.id, trigger: "test", startedAt: new Date(started).toISOString(), durationMs: report.durationMs, outcome: r.jobs.length ? "ok" : "empty", retrieved: r.jobs.length, valid: validCount, duplicates: dupes }]);
  } catch (e) {
    const c = classify(e);
    checks.push({ label: c.outcome === "needs_setup" ? "Authentication" : "Connection", ok: false, detail: c.message });
    report = { at: new Date().toISOString(), ok: false, durationMs: Date.now() - started, checks, discovered: 0, valid: 0, duplicates: 0, sampleTitles: [], error: c.message };
    await store.recordRuns([{ id: newId("run"), sourceId: src.id, trigger: "test", startedAt: new Date(started).toISOString(), durationMs: report.durationMs, outcome: c.outcome, retrieved: 0, valid: 0, duplicates: 0, errorCode: c.code, message: c.message }]);
  }
  await audit(actor, report.ok ? "source.test_passed" : "source.test_failed", src.id, { discovered: report.discovered, valid: report.valid, error: report.error });
  return report;
}

/* --------------------------------------------------------------- refresh */

/** Re-read one opportunity from its canonical source (POST /opportunities/:id/refresh). */
export async function refreshOpportunity(opp: CanonicalOpportunity): Promise<{ status: "updated" | "gone" | "unavailable"; opportunity: CanonicalOpportunity; message?: string }> {
  const canonical = opp.sourceRecords.find((r) => r.canonical) ?? opp.sourceRecords[0];
  const src = (await listSources()).find((s) => s.id === canonical.sourceId);
  if (!src) return { status: "unavailable", opportunity: opp, message: "Its source is no longer registered" };
  try {
    const r = await withTimeout(runConnector(src, { query: opp.title, locations: [] }, "shallow"), src.limits.timeoutMs);
    const again = r.jobs.find((j) => j.id === canonical.legacyJobId);
    if (!again) return { status: "gone", opportunity: opp, message: `No longer listed on ${src.name}` };
    const fresh = canonicalize([{ source: src, job: again }]).opportunities[0];
    const merged: CanonicalOpportunity = { ...fresh, id: opp.id, sourceRecords: [...fresh.sourceRecords, ...opp.sourceRecords.filter((x) => x.sourceId !== src.id).map((x) => ({ ...x, canonical: false }))] };
    await jobsLakeStore().upsertOpportunities([merged]);
    return { status: "updated", opportunity: merged };
  } catch (e) {
    return { status: "unavailable", opportunity: opp, message: classify(e).message };
  }
}
