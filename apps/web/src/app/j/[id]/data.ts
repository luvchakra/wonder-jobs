import { cache } from "react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { lookupJobs } from "@/server/jobs/recover";

/**
 * A shared job, from JobsLake's record of public postings — the posting as its source published it, and
 * nothing from any candidate's account. Read once per request for the page, its metadata and its card.
 */
export const sharedJob = cache(async (id: string): Promise<CanonicalJob | null> => {
  const [job] = await lookupJobs([decodeURIComponent(id)]).catch(() => []);
  return job ?? null;
});

/** The employer's link, only when it is a web address. */
export function applyLink(job: CanonicalJob): string | null {
  return /^https?:\/\//i.test(job.applyUrl ?? "") ? job.applyUrl : null;
}

/** A plain-text start of the description, for the page and the preview text. */
export function excerpt(text: string, max = 420): string {
  const plain = (text ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, "")}…` : plain;
}
