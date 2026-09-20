import { JOB_SOURCES } from "@/domain/jobs/sources";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import type { PublicJobTeaser } from "@/components/auth/JobTeaser";
import { findJobById } from "./lookup";

const JOB_LINK_RE = /^\/app\/jobs\/([A-Za-z0-9_-]+)\/?$/;

/** The job id a `next=` redirect target points at, when it's a job detail link. */
export function jobIdFromNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const path = next.split("?")[0] ?? "";
  return JOB_LINK_RE.exec(path)?.[1] ?? null;
}

/**
 * The real, teaser-safe subset of a shared job's details for an anonymous
 * visitor on the sign-in/sign-up page. Never guesses: a job that can no
 * longer be found on its source (aged out, filled, malformed id) yields
 * null, and the auth page falls back to its normal, job-free layout.
 */
export async function publicJobTeaser(next: string | null | undefined): Promise<PublicJobTeaser | null> {
  const id = jobIdFromNextPath(next);
  if (!id) return null;
  const job = await findJobById(id).catch(() => null);
  if (!job) return null;
  const sourceName = JOB_SOURCES.find((s) => s.id === job.sourceId)?.name ?? job.sourceId;
  const description = job.description.trim();
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    salary: formatSalaryRange(job.salaryMin, job.salaryMax, job.currency),
    postedLabel: relativeTime(job.postedAt),
    sourceName,
    descriptionPreview: description.length > 220 ? `${description.slice(0, 220).trimEnd()}…` : description,
  };
}
