import type { Job } from "@/domain/jobs/types";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { SOURCE_FETCHERS, type SearchCriteria } from "./providers";

/**
 * Search one source with a short in-memory cache per function instance, on
 * top of Next's data cache for the upstream responses. A run that searches
 * six sources therefore costs one upstream round each, and a rerun minutes
 * later costs none.
 */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; jobs: Job[] }>();

export class SourceNeedsSetupError extends Error {
  constructor(public readonly sourceId: string) {
    super(`${sourceId} needs credentials on the server`);
    this.name = "SourceNeedsSetupError";
  }
}

export async function searchSource(sourceId: string, criteria: SearchCriteria): Promise<{ jobs: Job[]; cached: boolean }> {
  const fetcher = SOURCE_FETCHERS[sourceId];
  if (!fetcher) throw new Error(`Unknown source ${sourceId}`);
  if (!fetcher.available()) throw new SourceNeedsSetupError(sourceId);
  const key = `${sourceId}|${criteria.query.toLowerCase().trim()}|${criteria.locations.map((l) => l.toLowerCase().trim()).sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { jobs: hit.jobs, cached: true };
  const jobs = await fetcher.fetch(criteria);
  cache.set(key, { at: Date.now(), jobs });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 50);
    for (const [k] of oldest) cache.delete(k);
  }
  return { jobs, cached: false };
}

/** Which sources this deployment can actually query right now. */
export function sourceAvailability(): Record<string, boolean> {
  return Object.fromEntries(JOB_SOURCES.map((s) => [s.id, SOURCE_FETCHERS[s.id]?.available() ?? false]));
}
