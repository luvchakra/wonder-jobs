/**
 * Find jobs again by their WonderJobs id after they left the candidate's catalog — from JobsLake's durable
 * record of every posting it has found (`jobslake_opportunities`). Postings are public job data, not
 * tenant data; what comes back is the posting as the source published it, never filled in.
 */
import type { CanonicalJob } from "@/domain/jobs/types";
import { toCanonicalJob } from "@/domain/jobslake/wonderjobs";
import { jobsLakeStore } from "@/server/jobslake/store";

export const MAX_LOOKUP = 50;

export async function lookupJobs(ids: string[]): Promise<CanonicalJob[]> {
  const unique = [...new Set(ids.filter((id) => /^[\w.:-]{1,120}$/.test(id)))].slice(0, MAX_LOOKUP);
  const found = await Promise.all(
    unique.map(async (id) => {
      const o = await jobsLakeStore().getOpportunity(id).catch(() => undefined);
      // The id the candidate's records use, whichever source record JobsLake now calls canonical.
      return o ? [{ ...toCanonicalJob(o), id }] : [];
    }),
  );
  return found.flat();
}
