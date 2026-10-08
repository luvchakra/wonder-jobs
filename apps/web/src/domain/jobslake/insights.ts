/**
 * Source insights for the JobsLake console: what each source is worth to candidates, not just whether it
 * runs. Every KPI is counted from stored runs (with the relevance candidates' matching reported back) and
 * the warm pool; when there is nothing to count it is null and the page says so — nothing is estimated.
 *
 * Suggestions come from two places, both shown with the facts they rest on:
 *  - rules (deterministic): credentials missing, a source down, stale or duplicate-heavy, never relevant…
 *  - AI (a proposal only): a model reads the same facts and may suggest what to change; each suggestion is
 *    kept only if it cites facts that exist here, and the page shows those facts' real values beside it.
 * Neither ever changes a source. An operator acts on a suggestion from the source's own page.
 */
import type { SourceRun } from "./health";
import type { CanonicalOpportunity, SourceStatus } from "./protocol";

export interface SourceInsight {
  sourceId: string;
  name: string;
  status: SourceStatus;
  available: boolean;
  runs: number;
  /** ok or empty, of runs that reached the source. */
  successRate: number | null;
  p50LatencyMs: number | null;
  retrieved: number;
  valid: number;
  validRate: number | null;
  duplicateRate: number | null;
  /** Valid jobs per successful run. */
  yieldPerRun: number | null;
  /** Jobs in the pool this source contributed to. */
  poolJobs: number;
  /** Of those, the share no other source had — what would be lost without it. */
  exclusiveShare: number | null;
  freshShare: number | null;
  employerVerifiedShare: number | null;
  /** From candidates' matching (telemetry): jobs judged relevant / strong, and per valid job. */
  relevant: number;
  strong: number;
  relevantRate: number | null;
  strongRate: number | null;
  /** Whether any run in the period carried relevance telemetry; without it the rates are null. */
  measuredRelevance: boolean;
}

export interface InsightsView {
  days: number;
  since: string;
  pool: { jobs: number; sourcesContributing: number; exclusiveShare: number | null; freshShare: number | null; relevant: number; strong: number; relevantRate: number | null };
  sources: SourceInsight[];
  /** Thinnest areas of the pool (country, role family), for coverage suggestions. */
  gaps: { dimension: "country" | "role_family"; key: string; jobs: number }[];
  suggestions: Suggestion[];
}

export interface Fact {
  key: string;
  label: string;
  value: string;
}

export interface Suggestion {
  id: string;
  origin: "rules" | "ai";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  sourceId?: string;
  /** The facts it rests on, with their real values. */
  facts: Fact[];
}

const share = (n: number, d: number) => (d > 0 ? n / d : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

export interface InsightsInput {
  days: number;
  since: string;
  sources: { id: string; name: string; status: SourceStatus; available: boolean }[];
  runs: (SourceRun & { relevant?: number; strong?: number })[];
  opps: CanonicalOpportunity[];
  roleFamily: (title: string) => string;
}

export function sourceInsights(input: InsightsInput): InsightsView {
  const { sources, runs, opps } = input;
  const live = runs.filter((r) => r.startedAt >= input.since && r.trigger !== "test" && r.trigger !== "playground");
  const bySource = new Map<string, typeof live>();
  for (const r of live) bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r]);

  const poolBySource = new Map<string, CanonicalOpportunity[]>();
  for (const o of opps) for (const id of new Set(o.sourceRecords.map((r) => r.sourceId))) poolBySource.set(id, [...(poolBySource.get(id) ?? []), o]);

  const insights: SourceInsight[] = sources.map((s) => {
    const rs = bySource.get(s.id) ?? [];
    const counted = rs.filter((r) => ["ok", "empty", "timeout", "unavailable"].includes(r.outcome));
    const ok = counted.filter((r) => r.outcome === "ok" || r.outcome === "empty");
    const retrieved = rs.reduce((n, r) => n + r.retrieved, 0);
    const valid = rs.reduce((n, r) => n + r.valid, 0);
    const duplicates = rs.reduce((n, r) => n + r.duplicates, 0);
    const measured = rs.filter((r) => r.relevant != null || r.strong != null);
    const measuredValid = measured.reduce((n, r) => n + r.valid, 0);
    const relevant = measured.reduce((n, r) => n + (r.relevant ?? 0), 0);
    const strong = measured.reduce((n, r) => n + (r.strong ?? 0), 0);
    const pool = poolBySource.get(s.id) ?? [];
    const exclusive = pool.filter((o) => new Set(o.sourceRecords.map((r) => r.sourceId)).size === 1).length;
    return {
      sourceId: s.id,
      name: s.name,
      status: s.status,
      available: s.available,
      runs: rs.length,
      successRate: share(ok.length, counted.length),
      p50LatencyMs: median(ok.map((r) => r.durationMs)),
      retrieved,
      valid,
      validRate: share(valid, retrieved),
      duplicateRate: share(duplicates, retrieved),
      yieldPerRun: ok.length ? Math.round((valid / ok.length) * 10) / 10 : null,
      poolJobs: pool.length,
      exclusiveShare: share(exclusive, pool.length),
      freshShare: share(pool.filter((o) => o.freshness.ageDays <= 7).length, pool.length),
      employerVerifiedShare: share(pool.filter((o) => o.quality.employerVerified).length, pool.length),
      relevant,
      strong,
      relevantRate: share(relevant, measuredValid),
      strongRate: share(strong, measuredValid),
      measuredRelevance: measured.length > 0,
    };
  });

  const exclusiveAll = opps.filter((o) => new Set(o.sourceRecords.map((r) => r.sourceId)).size === 1).length;
  const measuredValidAll = live.filter((r) => r.relevant != null || r.strong != null).reduce((n, r) => n + r.valid, 0);
  const relevantAll = insights.reduce((n, s) => n + s.relevant, 0);
  const tally = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  };
  const gaps = opps.length
    ? [
        ...tally(opps.map((o) => o.country || "Unknown"))
          .filter(([k]) => k !== "Unknown")
          .slice(0, 4)
          .map(([key, jobs]) => ({ dimension: "country" as const, key, jobs })),
        ...tally(opps.map((o) => input.roleFamily(o.title)))
          .filter(([k]) => k !== "Other")
          .slice(0, 4)
          .map(([key, jobs]) => ({ dimension: "role_family" as const, key, jobs })),
      ]
    : [];

  const view: InsightsView = {
    days: input.days,
    since: input.since,
    pool: {
      jobs: opps.length,
      sourcesContributing: insights.filter((s) => s.poolJobs > 0).length,
      exclusiveShare: share(exclusiveAll, opps.length),
      freshShare: share(opps.filter((o) => o.freshness.ageDays <= 7).length, opps.length),
      relevant: relevantAll,
      strong: insights.reduce((n, s) => n + s.strong, 0),
      relevantRate: share(relevantAll, measuredValidAll),
    },
    sources: insights.sort((a, b) => b.strong - a.strong || b.relevant - a.relevant || b.poolJobs - a.poolJobs),
    gaps,
    suggestions: [],
  };
  view.suggestions = ruleSuggestions(view);
  return view;
}

/* ---------------------------------------------------------------- facts */

const pct = (v: number | null) => (v == null ? "no data" : `${Math.round(v * 100)}%`);

/** Every fact a suggestion may cite, by stable key, with its real value as the page shows it. */
export function insightFacts(v: InsightsView): Map<string, Fact> {
  const facts = new Map<string, Fact>();
  const add = (key: string, label: string, value: string) => facts.set(key, { key, label, value });
  add("pool.jobs", `Jobs in the pool (${v.days} d)`, String(v.pool.jobs));
  add("pool.exclusiveShare", "Jobs only one source found", pct(v.pool.exclusiveShare));
  add("pool.freshShare", "Pool posted in the last 7 days", pct(v.pool.freshShare));
  add("pool.relevantRate", "Jobs candidates found relevant", pct(v.pool.relevantRate));
  for (const s of v.sources) {
    const k = (m: string) => `source.${s.sourceId}.${m}`;
    add(k("status"), `${s.name}: status`, `${s.status}${s.available ? "" : " (needs setup)"}`);
    add(k("runs"), `${s.name}: runs`, String(s.runs));
    add(k("successRate"), `${s.name}: success rate`, pct(s.successRate));
    add(k("p50LatencyMs"), `${s.name}: median latency`, s.p50LatencyMs == null ? "no data" : `${(s.p50LatencyMs / 1000).toFixed(1)} s`);
    add(k("valid"), `${s.name}: valid jobs`, String(s.valid));
    add(k("validRate"), `${s.name}: valid rate`, pct(s.validRate));
    add(k("duplicateRate"), `${s.name}: duplicate rate`, pct(s.duplicateRate));
    add(k("yieldPerRun"), `${s.name}: valid jobs per run`, s.yieldPerRun == null ? "no data" : String(s.yieldPerRun));
    add(k("poolJobs"), `${s.name}: jobs in the pool`, String(s.poolJobs));
    add(k("exclusiveShare"), `${s.name}: found only here`, pct(s.exclusiveShare));
    add(k("freshShare"), `${s.name}: posted in 7 days`, pct(s.freshShare));
    add(k("employerVerifiedShare"), `${s.name}: from employer sites`, pct(s.employerVerifiedShare));
    add(k("relevantRate"), `${s.name}: relevant to candidates`, s.measuredRelevance ? pct(s.relevantRate) : "not measured");
    add(k("strong"), `${s.name}: strong matches`, s.measuredRelevance ? String(s.strong) : "not measured");
  }
  for (const g of v.gaps) add(`gap.${g.dimension}.${g.key}`, `${g.dimension === "country" ? "Country" : "Role family"} ${g.key}: jobs in the pool`, String(g.jobs));
  return facts;
}

/* ---------------------------------------------------------- rule-based */

export function ruleSuggestions(v: InsightsView): Suggestion[] {
  const facts = insightFacts(v);
  const cite = (...keys: string[]) => keys.map((k) => facts.get(k)).filter((f): f is Fact => !!f);
  const out: Suggestion[] = [];
  for (const s of v.sources) {
    const k = (m: string) => `source.${s.sourceId}.${m}`;
    const on = s.status === "active" || s.status === "degraded";
    if (on && !s.available) out.push({ id: `needs_setup:${s.sourceId}`, origin: "rules", severity: "high", sourceId: s.sourceId, title: `Add credentials for ${s.name}`, detail: "It's active but can't be searched until its credential is set.", facts: cite(k("status")) });
    if (on && s.runs >= 3 && s.successRate != null && s.successRate < 0.7) out.push({ id: `failing:${s.sourceId}`, origin: "rules", severity: "high", sourceId: s.sourceId, title: `${s.name} fails too often`, detail: "Check its recent runs and errors; pause it if it keeps failing.", facts: cite(k("successRate"), k("runs")) });
    if (on && s.p50LatencyMs != null && s.p50LatencyMs > 6000) out.push({ id: `slow:${s.sourceId}`, origin: "rules", severity: "medium", sourceId: s.sourceId, title: `${s.name} is slow`, detail: "It holds every search up. Lower its result limit or timeout.", facts: cite(k("p50LatencyMs")) });
    if (s.retrieved >= 50 && s.duplicateRate != null && s.duplicateRate > 0.6 && (s.exclusiveShare ?? 0) < 0.1) out.push({ id: `redundant:${s.sourceId}`, origin: "rules", severity: "medium", sourceId: s.sourceId, title: `${s.name} mostly repeats other sources`, detail: "Little would be lost without it; consider pausing it to speed searches up.", facts: cite(k("duplicateRate"), k("exclusiveShare")) });
    if (s.poolJobs >= 20 && s.freshShare != null && s.freshShare < 0.3) out.push({ id: `stale:${s.sourceId}`, origin: "rules", severity: "low", sourceId: s.sourceId, title: `${s.name} returns mostly older jobs`, detail: "Check whether it sorts by newest, or filter older postings out.", facts: cite(k("freshShare")) });
    if (s.measuredRelevance && s.valid >= 50 && s.relevant === 0) out.push({ id: `irrelevant:${s.sourceId}`, origin: "rules", severity: "medium", sourceId: s.sourceId, title: `Nothing from ${s.name} matched candidates`, detail: "Its jobs don't fit who is searching. Narrow its queries, or pause it.", facts: cite(k("valid"), k("relevantRate")) });
    if (s.retrieved >= 20 && s.validRate != null && s.validRate < 0.6) out.push({ id: `invalid:${s.sourceId}`, origin: "rules", severity: "medium", sourceId: s.sourceId, title: `Many ${s.name} jobs fail validation`, detail: "Fix its field mapping (title, apply URL, company) on the source page.", facts: cite(k("validRate")) });
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------------------ AI */

/**
 * A model's suggestions, kept only when each cites at least one fact that exists (unknown keys are dropped)
 * and names, if any, a source that exists. The facts shown are the app's values, never the model's text.
 */
export function checkedAiSuggestions(raw: { title: string; detail: string; severity?: string; sourceId?: string; facts: string[] }[] | undefined, v: InsightsView): Suggestion[] {
  const facts = insightFacts(v);
  const ids = new Set(v.sources.map((s) => s.sourceId));
  const out: Suggestion[] = [];
  for (const [i, r] of (raw ?? []).entries()) {
    const cited = [...new Set(r.facts)].map((k) => facts.get(k)).filter((f): f is Fact => !!f);
    if (!cited.length || !r.title.trim()) continue;
    const sourceId = r.sourceId && ids.has(r.sourceId) ? r.sourceId : undefined;
    const severity = r.severity === "high" || r.severity === "low" ? r.severity : "medium";
    out.push({ id: `ai:${i}`, origin: "ai", severity, sourceId, title: r.title.trim().slice(0, 120), detail: r.detail.trim().slice(0, 400), facts: cited.slice(0, 6) });
  }
  return out.slice(0, 6);
}
