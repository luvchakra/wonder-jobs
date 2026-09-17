/**
 * Job source adapters. Each adapter streams pages of raw postings for a search
 * query. Additional platforms plug in by implementing JobSourceAdapter.
 */
import type { Job, JobSource } from "@/domain/jobs/types";
import type { RunConfig } from "@/domain/workflow/types";
import { JOB_SOURCES } from "@/services/mock/catalog";
import { getUniverse } from "@/services/mock/universe";

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
  constructor(public readonly sourceId: string, message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

/** Mock adapter backed by the deterministic universe; pages arrive with realistic latency. */
export class MockSourceAdapter implements JobSourceAdapter {
  constructor(public readonly source: JobSource) {}

  async *search(criteria: RunConfig["searchCriteria"], opts: { pageSize?: number; sleep?: (ms: number) => Promise<void> } = {}) {
    const pageSize = opts.pageSize ?? 100;
    const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const all = getUniverse().bySource[this.source.id] ?? [];
    const q = criteria.query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? all.filter((j) => {
          const hay = `${j.title} ${j.company} ${j.skills.join(" ")} ${j.tags.join(" ")}`.toLowerCase();
          return terms.some((t) => hay.includes(t)) || /product|manager|pm/.test(q);
        })
      : all;
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    for (let page = 0; page < totalPages; page++) {
      await sleep(90 + (page % 3) * 40);
      yield { jobs: matches.slice(page * pageSize, (page + 1) * pageSize), page: page + 1, totalPages };
    }
  }
}

const registry = new Map<string, JobSourceAdapter>();
for (const s of JOB_SOURCES) registry.set(s.id, new MockSourceAdapter(s));

export function getSourceAdapter(id: string) {
  return registry.get(id);
}

export function listSourceAdapters() {
  return [...registry.values()];
}

export function registerSourceAdapter(adapter: JobSourceAdapter) {
  registry.set(adapter.source.id, adapter);
}
