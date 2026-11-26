/**
 * Search coverage (`domain/jobslake/coverage.ts`): runs the probes through WorksLake's own search, keeps the latest
 * report under the platform tenant, and builds the admin view. The probes run weekly on the GitHub runner
 * (scripts/search-coverage.mjs, .github/workflows/search-coverage.yml), never on the site: a run is ~150 searches.
 * Neither the report nor the view holds anything about a person: probes are fixed words, and real searches are
 * shown by their words only (the runs log carries no tenant).
 */
import { COVERAGE_FAMILIES, COVERAGE_PLACES, coverageMatrix, isRealMatch, missingSources, realSearches, sourceContribution, type CoverageReport, type CoverageView, type ProbeResult } from "@/domain/jobslake/coverage";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { search } from "./core";
import { jobsLakeStore } from "./store";

const KEY = "wj.coverage";
/** Sources that couldn't be asked: what the page lists as missing. */
const MISSING = new Set(["needs_setup", "unavailable", "timeout"]);

export async function loadCoverage(): Promise<CoverageReport | undefined> {
  const doc = await stateStore.get(PLATFORM_TENANT, KEY).catch(() => undefined);
  const r = doc?.state as CoverageReport | undefined;
  return r && Array.isArray(r.probes) ? r : undefined;
}

/** One probe: a search of Jobs' sources for a family's words in one place, counted by real matches. */
export async function runProbe(familyId: string, place: (typeof COVERAGE_PLACES)[number]): Promise<ProbeResult> {
  const family = COVERAGE_FAMILIES.find((f) => f.id === familyId);
  if (!family) throw new Error(`Unknown family ${familyId}`);
  try {
    const { response } = await search({ query: { text: family.query, locations: [place] }, searchMode: "balanced", limit: 200, module: "jobs" }, { trigger: "coverage" });
    const bySource: Record<string, number> = {};
    let matches = 0;
    for (const o of response.results) {
      if (!isRealMatch(o.title, family.query)) continue;
      matches += 1;
      for (const id of new Set(o.sourceRecords.map((r) => r.sourceId))) bySource[id] = (bySource[id] ?? 0) + 1;
    }
    const missing = response.sources.filter((s) => MISSING.has(s.outcome)).map((s) => ({ sourceId: s.sourceId, outcome: s.outcome }));
    return { familyId, place, results: response.results.length, matches, bySource, missing };
  } catch (e) {
    return { familyId, place, results: 0, matches: null, bySource: {}, missing: [], error: e instanceof Error ? e.message.slice(0, 200) : "failed" };
  }
}

/**
 * Every probe, a few at a time, within the time budget; saved at the end (and part-way, so a cut-short run still
 * shows what it measured). Probes the budget didn't reach stay out of the report, and the page shows them as "Didn't run".
 */
export async function runCoverage(opts: { ranOn: string; budgetMs?: number; concurrency?: number; save?: (r: CoverageReport) => Promise<void> }): Promise<CoverageReport> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 35 * 60_000;
  const save = opts.save ?? ((r: CoverageReport) => stateStore.put(PLATFORM_TENANT, KEY, r));
  const queue = COVERAGE_FAMILIES.flatMap((f) => COVERAGE_PLACES.map((place) => ({ familyId: f.id, place })));
  const report: CoverageReport = { ranAt: new Date(started).toISOString(), ranOn: opts.ranOn, durationMs: 0, probes: [] };
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (Date.now() - started > budget) return;
      report.probes.push(await runProbe(next.familyId, next.place));
      if (report.probes.length % 25 === 0) await save({ ...report, durationMs: Date.now() - started }).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, worker));
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  await save(report);
  return report;
}

/** The admin page: the latest report as a matrix, which sources help, which couldn't be asked, and real searches' thinnest words. */
export async function coverageView(days = 14): Promise<CoverageView> {
  const report = await loadCoverage();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const runs = await jobsLakeStore().listRuns({ sinceIso: since, limit: 5000 }).catch(() => []);
  return {
    report: report ? { ranAt: report.ranAt, finishedAt: report.finishedAt, ranOn: report.ranOn, durationMs: report.durationMs, probes: report.probes.length, planned: COVERAGE_FAMILIES.length * COVERAGE_PLACES.length } : null,
    places: COVERAGE_PLACES,
    matrix: report ? coverageMatrix(report) : [],
    contribution: sourceContribution(report),
    missing: missingSources(report),
    real: { days, rows: realSearches(runs) },
  };
}
