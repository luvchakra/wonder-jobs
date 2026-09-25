/**
 * Job source adapters. Each adapter streams pages of postings for a search.
 * Signed-in accounts search real sources through the server (`/api/jobs/search`,
 * one request per source, so evidence and progress are per source); the demo
 * and local development use the deterministic sample universe.
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

/** Live adapter: the server fetches and normalizes the source; pages are sliced here so progress is observable. */
export class RemoteSourceAdapter implements JobSourceAdapter {
  constructor(public readonly source: JobSource) {}

  async *search(criteria: RunConfig["searchCriteria"], opts: { pageSize?: number; sleep?: (ms: number) => Promise<void> } = {}) {
    const pageSize = opts.pageSize ?? 40;
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const params = new URLSearchParams({ source: this.source.id, q: criteria.query, locations: criteria.locations.join(",") });
    let res: Response;
    try {
      res = await fetch(`/api/jobs/search?${params}`, { cache: "no-store" });
    } catch {
      throw new SourceUnavailableError(this.source.id, `${this.source.name} could not be reached.`);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; kind?: string };
      throw new SourceUnavailableError(this.source.id, body.error ?? `${this.source.name} responded ${res.status}`, body.kind === "needs_setup" ? "needs_setup" : "unavailable");
    }
    const { jobs } = (await res.json()) as { jobs: Job[] };
    const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
    for (let page = 0; page < totalPages; page++) {
      if (page > 0) await sleep(60);
      yield { jobs: jobs.slice(page * pageSize, (page + 1) * pageSize), page: page + 1, totalPages };
    }
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
      await sleep(90 + (page % 3) * 40);
      yield { jobs: matches.slice(page * pageSize, (page + 1) * pageSize), page: page + 1, totalPages };
    }
  }
}

const live = new Map<string, JobSourceAdapter>();
const sample = new Map<string, JobSourceAdapter>();
for (const s of JOB_SOURCES) {
  live.set(s.id, new RemoteSourceAdapter(s));
  sample.set(s.id, new MockSourceAdapter(s));
}

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
