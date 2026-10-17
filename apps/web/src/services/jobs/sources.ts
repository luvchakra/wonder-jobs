/**
 * Sample job source adapters for the demo and local development (the deterministic sample universe).
 * Signed-in accounts search only through JobsLake (owner, 2026-10-17); there is no live adapter here,
 * so nothing in the browser can search a source directly.
 */
import type { Job, JobSource } from "@/domain/jobs/types";
import type { RunConfig } from "@/domain/workflow/types";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { getUniverse } from "@/services/mock/universe";
import { getClientMode } from "@/lib/mode";
import { matchesQuery } from "./normalize";

export interface SourceSearchPage {
  jobs: Job[];
  page: number;
  totalPages: number;
}

export interface JobSourceAdapter {
  readonly source: JobSource;
  search(criteria: RunConfig["searchCriteria"], opts?: { pageSize?: number; sleep?: (ms: number) => Promise<void> }): AsyncGenerator<SourceSearchPage>;
}

export class SourceUnavailableError extends Error {
  constructor(public readonly sourceId: string, message: string, public readonly kind: "unavailable" | "needs_setup" = "unavailable") {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

/**
 * Extra latency per page for the sample sources, read from `localStorage["wj.demoSourceLatencyMs"]`.
 * Sample data only (demo and local mode): end-to-end tests set it so a search is still running when
 * they pause or stop it. Real sources never read it.
 */
function demoLatencyMs(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem("wj.demoSourceLatencyMs"));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 10_000) : 0;
  } catch {
    return 0;
  }
}

/** Sample adapter backed by the deterministic universe; pages arrive with realistic latency. */
export class MockSourceAdapter implements JobSourceAdapter {
  constructor(public readonly source: JobSource) {}

  async *search(criteria: RunConfig["searchCriteria"], opts: { pageSize?: number; sleep?: (ms: number) => Promise<void> } = {}) {
    const pageSize = opts.pageSize ?? 100;
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const all = getUniverse().bySource[this.source.id] ?? [];
    const q = criteria.query.trim().toLowerCase();
    // The same matcher the live path uses, so a demo search for "senior director vp iam" doesn't
    // return every "Senior Product Manager" just because one word ("senior") appears. The sample
    // universe is product-management heavy, so PM searches still see all of it.
    const matches = q ? all.filter((j) => /product|manager|\bpm\b/.test(q) || matchesQuery(j, q)) : all;
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    for (let page = 0; page < totalPages; page++) {
      await sleep(90 + (page % 3) * 40 + demoLatencyMs());
      yield { jobs: matches.slice(page * pageSize, (page + 1) * pageSize), page: page + 1, totalPages };
    }
  }
}

const live = new Map<string, JobSourceAdapter>();
const sample = new Map<string, JobSourceAdapter>();
for (const s of JOB_SOURCES) sample.set(s.id, new MockSourceAdapter(s));

function registry() {
  return getClientMode().mode === "user" ? live : sample;
}

export function getSourceAdapter(id: string) {
  return registry().get(id);
}

export function listSourceAdapters() {
  return [...registry().values()];
}

export function registerSourceAdapter(adapter: JobSourceAdapter) {
  live.set(adapter.source.id, adapter);
}
