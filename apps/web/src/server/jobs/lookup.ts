import type { Job } from "@/domain/jobs/types";
import { JOB_SOURCE_IDS } from "@/domain/jobs/sources";
import { normalizePosting } from "@/services/jobs/normalize";
import { findCareerRawPosting, SOURCE_FETCHERS } from "./providers";

/**
 * Re-derives a specific job from its id alone, for the one anonymous-readable
 * case: a shared job link. There is no public jobs store — job ids are a
 * one-way hash of `sourceId:externalId` (see normalizePosting) — so this
 * re-fetches the real source and matches the hash. Returns null when the
 * posting can no longer be found (aged out, filled, id malformed), never a
 * fabricated stand-in.
 */
export async function findJobById(id: string): Promise<Job | null> {
  const sourceId = JOB_SOURCE_IDS.find((s) => id.startsWith(`${s}_`));
  if (!sourceId) return null;
  const hash = id.slice(sourceId.length + 1);
  if (!hash) return null;

  if (sourceId === "careers") {
    const raw = await findCareerRawPosting(hash);
    return raw ? normalizePosting("careers", raw) : null;
  }

  const fetcher = SOURCE_FETCHERS[sourceId];
  if (!fetcher || !fetcher.available()) return null;
  // An empty query/location fetch returns that source's broad, unfiltered
  // feed (matchesQuery/matchesLocations both pass everything through), so a
  // job present anywhere in it is found regardless of what it was searched for.
  const jobs = await fetcher.fetch({ query: "", locations: [] });
  return jobs.find((j) => j.id === id) ?? null;
}
