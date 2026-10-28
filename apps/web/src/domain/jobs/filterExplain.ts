/**
 * "Why Was This Filtered" (spec §11 — the companion to "Why This Job": explaining not just why a shown
 * job scored the way it did, but why a job the candidate can't see right now isn't showing).
 *
 * WonderJobs never silently drops a discovered job from the catalog — the rank stage publishes every
 * deduplicated posting with its real score (`services/workflow/executors.ts`), and what actually hides a
 * job from the candidate's view is the Jobs page's own filter bar plus "not for me". So the honest,
 * buildable version of "why filtered" here is exactly that: which of the candidate's own active filters
 * is hiding which jobs, and how many. This is the single source of truth both the results list and the
 * breakdown UI read from, so they can never disagree about what's visible.
 */
import type { CanonicalJob, JobFilters, JobMatch } from "@/domain/jobs/types";
import { readPay } from "@/domain/jobs/payWords";
import { jobTypeOf, readJobTypeWords } from "@/domain/jobs/jobType";
import { relevance } from "@/services/jobs/relevance";
import { hasTermOrSynonym, inPlaces } from "@/services/jobs/normalize";
import { postingTooOld } from "@/domain/jobs/age";
import { findModeOf, inMode } from "@/domain/jobs/findMode";

export type FilterReason = "rejected" | "not_saved" | "too_old" | "work_mode" | "source" | "min_fit" | "freshness" | "min_salary" | "no_salary" | "level" | "job_type" | "other_mode" | "company" | "location" | "profile" | "in_pipeline" | "search_text";

export const FILTER_REASON_LABEL: Record<FilterReason, string> = {
  rejected: "marked not for me",
  not_saved: "not saved (Saved only is on)",
  too_old: "posted more than 2 weeks ago",
  work_mode: "a different work mode",
  source: "a different source",
  min_fit: "below your minimum fit",
  freshness: "older than your freshness window",
  min_salary: "below your minimum salary",
  no_salary: "pay not listed",
  level: "a different level",
  job_type: "a different job type",
  other_mode: "for the other mode (Full Time or Part Time)",
  company: "a different company",
  location: "outside the places you picked",
  profile: "outside your Career Profile",
  in_pipeline: "already in your Pipeline",
  search_text: "doesn't match your search text",
};

const FIT_RANK: Record<JobMatch["fit"], number> = { strong: 3, worth_considering: 2, stretch: 1, low_fit: 0 };
const DAY = 86_400_000;

export interface FilterResult {
  /** Job ids that pass every active filter, in catalog order (the caller sorts). */
  visibleIds: string[];
  /** How many hidden jobs each active filter accounts for. A job counts against the *first* filter it
   *  fails, in the same order the filters are actually applied, so counts never double up past the total. */
  hiddenByReason: Partial<Record<FilterReason, number>>;
  hiddenTotal: number;
  totalCatalog: number;
  /** How well each visible job answers the search text (0..1), when there is one — what "Best match" sorts by first. */
  relevance?: Record<string, number>;
}

/**
 * The one place the per-job filter chain lives — `applyJobFilters` (the results list) and
 * `explainJobVisibility` (a single job, e.g. for "why isn't X showing") both call this, so they
 * can never disagree about what's hiding a given job.
 */
/** Whether a posting names the candidate's field (`fieldTerms` of their Career Profile) where it counts: title, skills, tags or requirements. */
export function inProfileField(job: Pick<CanonicalJob, "title" | "skills" | "tags" | "requirements">, field: string[]): boolean {
  if (!field.length) return true;
  const text = `${job.title} · ${job.skills.join(" · ")} · ${job.tags.join(" · ")} · ${job.requirements.join(" · ")}`;
  return field.some((w) => hasTermOrSynonym(text, w));
}

function firstFailedReason(job: CanonicalJob, match: JobMatch | undefined, rejected: string | undefined, isSaved: boolean, filters: JobFilters, query: string, now: number, rel?: (score: number) => void, field: string[] = [], inPipeline = false): FilterReason | null {
  if (rejected) return "rejected";
  if (filters.onlySaved && !isSaved) return "not_saved";
  // Too old to trust: a job board's listing often outlives the employer's page. Saved jobs are kept.
  if (!filters.includeOld && !isSaved && postingTooOld(job.postedAt, now)) return "too_old";
  if (filters.workModes.length && !filters.workModes.includes(job.workMode)) return "work_mode";
  if (filters.sourceIds.length && !job.sourceIds.some((s) => filters.sourceIds.includes(s))) return "source";
  if (filters.minFit && (!match || (filters.exactFit ? match.fit !== filters.minFit : FIT_RANK[match.fit] < FIT_RANK[filters.minFit]))) return "min_fit";
  if (filters.freshnessDays && now - new Date(job.postedAt).getTime() > filters.freshnessDays * DAY) return "freshness";
  if (filters.minSalary && (job.salaryMax == null || (job.currency === "INR" ? job.salaryMax : job.salaryMax * 30) < filters.minSalary)) return "min_salary";
  if (filters.salaryListed && job.salaryMax == null && job.salaryMin == null) return "no_salary";
  if (filters.levels?.length && !filters.levels.includes(job.seniority)) return "level";
  if (filters.jobTypes?.length) {
    const t = jobTypeOf(job);
    if (!t || !filters.jobTypes.includes(t)) return "job_type";
  } else if (!filters.onlySaved && !inMode(jobTypeOf(job), findModeOf(filters))) {
    // All in Full Time leaves out gigs, part-time jobs and internships; All in Part Time, full-time jobs. Saved shows everything saved.
    return "other_mode";
  }
  if (filters.company?.trim() && !job.company.toLowerCase().includes(filters.company.trim().toLowerCase())) return "company";
  if (filters.locations?.length && !inPlaces(job, filters.locations)) return "location";
  if (filters.strictProfile && !inProfileField(job, field)) return "profile";
  if (filters.hideInPipeline && inPipeline) return "in_pipeline";
  if (query) {
    // Every role or field word somewhere in the posting, as any form of it ("psychology" ↔ "Psychologist").
    const r = relevance(job, query);
    if (!r.complete) return "search_text";
    rel?.(r.score);
  }
  return null;
}

export function applyJobFilters(
  order: string[],
  jobs: Record<string, CanonicalJob>,
  matches: Record<string, JobMatch>,
  rejected: Record<string, string>,
  saved: Record<string, string>,
  filters: JobFilters,
  now: number,
  /** The candidate's field words (`fieldTerms`), for "Search strictly within your Career Profile". */
  field: string[] = [],
  /** Jobs with an application past Saved, for "Hide jobs already in your Pipeline". */
  inPipeline: ReadonlySet<string> = new Set(),
): FilterResult {
  // Pay words ("high paying") order the list by pay and job-type words ("part time") pick the types; neither matches job text.
  const query = readJobTypeWords(readPay(filters.query).rest).rest.trim();
  const visibleIds: string[] = [];
  const scores: Record<string, number> = {};
  const hiddenByReason: Partial<Record<FilterReason, number>> = {};
  let totalCatalog = 0;

  for (const id of order) {
    const j = jobs[id];
    if (!j) continue; // not a catalog gap the candidate can act on — the id is simply stale
    totalCatalog++;
    const reason = firstFailedReason(j, matches[id], rejected[id], !!saved[id], filters, query, now, (r) => (scores[id] = r), field, inPipeline.has(id));
    if (reason) hiddenByReason[reason] = (hiddenByReason[reason] ?? 0) + 1;
    else visibleIds.push(id);
  }

  const hiddenTotal = totalCatalog - visibleIds.length;
  return { visibleIds, hiddenByReason, hiddenTotal, totalCatalog, ...(query ? { relevance: scores } : {}) };
}

/**
 * "Why isn't this job showing?" for one specific job (Ask Wonder's `explain_why_not_shown`
 * intent). Distinguishes a job that's genuinely not in the catalog at all from one the
 * candidate's own active filters are hiding — the two are different honest answers.
 */
export function explainJobVisibility(
  job: CanonicalJob | undefined,
  matches: Record<string, JobMatch>,
  rejected: Record<string, string>,
  saved: Record<string, string>,
  filters: JobFilters,
  now: number,
): { inCatalog: boolean; visible: boolean; reason: FilterReason | null } {
  if (!job) return { inCatalog: false, visible: false, reason: null };
  const reason = firstFailedReason(job, matches[job.id], rejected[job.id], !!saved[job.id], filters, filters.query.trim(), now);
  return { inCatalog: true, visible: !reason, reason };
}

/**
 * The two ways out of "why isn't this showing?" (outcome spec §11), per reason: show it anyway
 * (clear just that filter, or undo the rejection) or go change the preference behind it. Only the
 * one filter responsible is cleared — never every preference at once.
 */
export const FILTER_REASON_FIX: Record<FilterReason, { showAnyway: Partial<JobFilters> | "unreject" | "switch_mode"; preference: { label: string; href: string } }> = {
  rejected: { showAnyway: "unreject", preference: { label: "Review what Wonder learned", href: "/app/career-dna" } },
  not_saved: { showAnyway: { onlySaved: false }, preference: { label: "See all jobs", href: "/app/jobs" } },
  too_old: { showAnyway: { includeOld: true }, preference: { label: "See recent jobs", href: "/app/jobs" } },
  work_mode: { showAnyway: { workModes: [] }, preference: { label: "Change work modes", href: "/app/career-dna" } },
  source: { showAnyway: { sourceIds: [], savedEasyApply: false }, preference: { label: "Change sources", href: "/app/jobs" } },
  min_fit: { showAnyway: { minFit: null }, preference: { label: "Change minimum fit", href: "/app/jobs" } },
  freshness: { showAnyway: { freshnessDays: null }, preference: { label: "Change how recent", href: "/app/jobs" } },
  min_salary: { showAnyway: { minSalary: undefined }, preference: { label: "Change minimum salary", href: "/app/career-dna" } },
  no_salary: { showAnyway: { salaryListed: false }, preference: { label: "Change filters", href: "/app/jobs" } },
  level: { showAnyway: { levels: [] }, preference: { label: "Change filters", href: "/app/jobs" } },
  job_type: { showAnyway: { jobTypes: [] }, preference: { label: "Change filters", href: "/app/jobs" } },
  other_mode: { showAnyway: "switch_mode", preference: { label: "Back to Find", href: "/app/jobs" } },
  company: { showAnyway: { company: "" }, preference: { label: "Change filters", href: "/app/jobs" } },
  location: { showAnyway: { locations: [] }, preference: { label: "Change your places", href: "/app/career-dna" } },
  profile: { showAnyway: { strictProfile: false }, preference: { label: "Edit your Career Profile", href: "/app/career-dna" } },
  in_pipeline: { showAnyway: { hideInPipeline: false }, preference: { label: "Open your Pipeline", href: "/app/applications" } },
  search_text: { showAnyway: { query: "" }, preference: { label: "Change the search", href: "/app/jobs" } },
};
