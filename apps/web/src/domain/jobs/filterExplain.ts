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

export type FilterReason = "rejected" | "not_saved" | "work_mode" | "source" | "min_fit" | "freshness" | "min_salary" | "search_text";

export const FILTER_REASON_LABEL: Record<FilterReason, string> = {
  rejected: "marked not for me",
  not_saved: "not saved (Saved only is on)",
  work_mode: "a different work mode",
  source: "a different source",
  min_fit: "below your minimum fit",
  freshness: "older than your freshness window",
  min_salary: "below your minimum salary",
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
}

/**
 * The one place the per-job filter chain lives — `applyJobFilters` (the results list) and
 * `explainJobVisibility` (a single job, e.g. for "why isn't X showing") both call this, so they
 * can never disagree about what's hiding a given job.
 */
function firstFailedReason(job: CanonicalJob, match: JobMatch | undefined, rejected: string | undefined, isSaved: boolean, filters: JobFilters, terms: string[], now: number): FilterReason | null {
  if (rejected) return "rejected";
  if (filters.onlySaved && !isSaved) return "not_saved";
  if (filters.workModes.length && !filters.workModes.includes(job.workMode)) return "work_mode";
  if (filters.sourceIds.length && !job.sourceIds.some((s) => filters.sourceIds.includes(s))) return "source";
  if (filters.minFit && (!match || FIT_RANK[match.fit] < FIT_RANK[filters.minFit])) return "min_fit";
  if (filters.freshnessDays && now - new Date(job.postedAt).getTime() > filters.freshnessDays * DAY) return "freshness";
  if (filters.minSalary && (job.salaryMax == null || (job.currency === "INR" ? job.salaryMax : job.salaryMax * 30) < filters.minSalary)) return "min_salary";
  if (terms.length) {
    const hay = `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")} ${job.tags.join(" ")}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return "search_text";
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
): FilterResult {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleIds: string[] = [];
  const hiddenByReason: Partial<Record<FilterReason, number>> = {};
  let totalCatalog = 0;

  for (const id of order) {
    const j = jobs[id];
    if (!j) continue; // not a catalog gap the candidate can act on — the id is simply stale
    totalCatalog++;
    const reason = firstFailedReason(j, matches[id], rejected[id], !!saved[id], filters, terms, now);
    if (reason) hiddenByReason[reason] = (hiddenByReason[reason] ?? 0) + 1;
    else visibleIds.push(id);
  }

  const hiddenTotal = totalCatalog - visibleIds.length;
  return { visibleIds, hiddenByReason, hiddenTotal, totalCatalog };
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
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const reason = firstFailedReason(job, matches[job.id], rejected[job.id], !!saved[job.id], filters, terms, now);
  return { inCatalog: true, visible: !reason, reason };
}
