import type { CanonicalJob } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { shareFacts } from "@/domain/jobs/share";
import { sharedJob } from "@/app/j/[id]/data";
import { sharedListing } from "./listing";
import type { SummaryInput } from "./summary";
import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";

/** A job's labelled details, as its share image and summary use them. */
export function jobLines(job: CanonicalJob): string[] {
  return [
    job.seniority && `Level: ${job.seniority[0].toUpperCase()}${job.seniority.slice(1)}`,
    job.skills?.length ? `Skills: ${job.skills.slice(0, 6).join(", ")}` : null,
    job.postedAt && `Posted: ${new Date(job.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
  ].filter((x): x is string => !!x);
}

/** A job's headline facts as chips: pay first, then place, work mode and type. */
export function jobChips(job: CanonicalJob, salary: string | null): string[] {
  const type = jobTypeOf(job);
  return [salary, job.location, WORK_MODE_LABEL[job.workMode], type ? JOB_TYPE_LABEL[type] : null].filter((x): x is string => !!x);
}

export type Shared = { kind: "job"; key: string; job: CanonicalJob; input: SummaryInput } | { kind: "listing"; key: string; module: string; listing: ListingShareProps; input: SummaryInput };

/**
 * What a public share page (`/j/<id>` or `/s/<module>/<id>`) shows, read from the public record, with what its summary is
 * made from. Null for anything else or a listing that's gone.
 */
export async function sharedFor(page: string): Promise<Shared | null> {
  const j = /^\/j\/([^/?#]{1,200})$/.exec(page);
  if (j) {
    const job = await sharedJob(j[1]);
    return job ? { kind: "job", key: `j:${job.id}`, job, input: { noun: "job", title: `${job.title} at ${job.company}`, facts: [shareFacts(job)], lines: jobLines(job), details: job.description } } : null;
  }
  const s = /^\/s\/([a-z]{1,30})\/([^/?#]{1,200})$/.exec(page);
  if (!s) return null;
  const listing = await sharedListing(s[1], s[2]);
  return listing ? { kind: "listing", key: `s:${s[1]}:${decodeURIComponent(s[2])}`, module: s[1], listing, input: listing } : null;
}
