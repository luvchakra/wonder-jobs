import { JOB_SOURCES } from "@/domain/jobs/sources";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { computeQuality } from "@/services/jobs/matching";
import { COMPANIES } from "@/services/mock/catalog";
import type { PublicJobTeaser } from "@/components/auth/JobTeaser";
import { findJobById } from "./lookup";

const JOB_LINK_RE = /^\/app\/jobs\/([A-Za-z0-9_-]+)\/?$/;
const SOURCES_BY_ID = Object.fromEntries(JOB_SOURCES.map((s) => [s.id, s]));

/** The job id a `next=` redirect target points at, when it's a job detail link. */
export function jobIdFromNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const path = next.split("?")[0] ?? "";
  return JOB_LINK_RE.exec(path)?.[1] ?? null;
}

/**
 * The real details of a shared job for an anonymous visitor on the
 * sign-in/sign-up page — everything about the *posting itself* (full
 * description, requirements, skills, company, and the same hiring-quality
 * signals a signed-in candidate sees, since those are computed from the
 * posting alone). The one thing that's genuinely per-candidate — a match
 * score against Career DNA — has no value to show and isn't computed here;
 * the UI says so rather than pretending. Never guesses: a job that can no
 * longer be found on its source (aged out, filled, malformed id) yields
 * null, and the auth page falls back to its normal, job-free layout.
 */
export async function publicJobTeaser(next: string | null | undefined): Promise<PublicJobTeaser | null> {
  const id = jobIdFromNextPath(next);
  if (!id) return null;
  const job = await findJobById(id).catch(() => null);
  if (!job) return null;
  const source = SOURCES_BY_ID[job.sourceId];
  const company = COMPANIES.find((c) => c.name === job.company);
  return {
    title: job.title,
    company: job.company,
    companyDomain: job.companyDomain,
    companyHq: company?.hq,
    companySize: company?.size,
    location: job.location,
    workMode: job.workMode,
    salary: formatSalaryRange(job.salaryMin, job.salaryMax, job.currency),
    postedLabel: relativeTime(job.postedAt),
    sourceName: source?.name ?? job.sourceId,
    industry: job.industry,
    seniority: job.seniority,
    description: job.description,
    requirements: job.requirements,
    niceToHave: job.niceToHave,
    skills: job.skills,
    quality: computeQuality(job, SOURCES_BY_ID),
  };
}
