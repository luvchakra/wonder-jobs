import type { Job } from "@/domain/jobs/types";
import type { SearchCriteria } from "@/server/jobs/providers";
import type { SourceRecord } from "./types";

/**
 * End-to-end tests only. playwright.config.ts sets WJ_E2E_FIXTURE_JOBS=1 on the web server it starts (it is never set
 * on Vercel), so the built-in sources answer from a fixed set of postings instead of the network. Searches then run
 * through the real WorksLake path — planner, streaming, de-duplication, provenance — with the same answer every time.
 * Without the flag nothing here runs, and the fixture is never loaded.
 */
export const fixtureJobsOn = () => process.env.WJ_E2E_FIXTURE_JOBS === "1";

/** The fixture's postings for one built-in source. Sources that share a legacy id (Greenhouse, Lever, Ashby) split it: only the first answers. */
export async function fixtureJobs(s: SourceRecord, c: SearchCriteria, all: SourceRecord[]): Promise<Job[]> {
  const legacy = s.legacySourceId ?? s.id;
  if (all.find((b) => (b.legacySourceId ?? b.id) === legacy)?.id !== s.id) return [];
  const [{ getUniverse }, { matchesQuery }] = await Promise.all([import("@/testing/sample/universe"), import("@/services/jobs/normalize")]);
  const jobs = getUniverse().bySource[legacy] ?? [];
  const q = c.query.trim().toLowerCase();
  return q ? jobs.filter((j) => matchesQuery(j, q)) : jobs;
}
