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
import { relevance } from "@/services/jobs/relevance";
import { inPlaces } from "@/services/jobs/normalize";

export type FilterReason = "rejected" | "not_saved" | "work_mode" | "source" | "min_fit" | "freshness" | "min_salary" | "no_salary" | "level" | "company" | "location" | "search_text";

export const FILTER_REASON_LABEL: Record<FilterReason, string> = {
  rejected: "marked not for me",
  not_saved: "not saved (Saved only is on)",
  work_mode: "a different work mode",
  source: "a different source",
  min_fit: "below your minimum fit",
  freshness: "older than your freshness window",
  min_salary: "below your minimum salary",
  no_salary: "pay not listed",
  level: "a different level",
  company: "a different company",
  location: "outside the places you picked",
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
function firstFailedReason(job: CanonicalJob, match: JobMatch | undefined, rejected: string | undefined, isSaved: boolean, filters: JobFilters, query: string, now: number, rel?: (score: number) => void): FilterReason | null {
  if (rejected) return "rejected";
  if (filters.onlySaved && !isSaved) return "not_saved";
  if (filters.workModes.length && !filters.workModes.includes(job.workMode)) return "work_mode";
  if (filters.sourceIds.length && !job.sourceIds.some((s) => filters.sourceIds.includes(s))) return "source";
  if (filters.minFit && (!match || FIT_RANK[match.fit] < FIT_RANK[filters.minFit])) return "min_fit";
  if (filters.freshnessDays && now - new Date(job.postedAt).getTime() > filters.freshnessDays * DAY) return "freshness";
  if (filters.minSalary && (job.salaryMax == null || (job.currency === "INR" ? job.salaryMax : job.salaryMax * 30) < filters.minSalary)) return "min_salary";
  if (filters.salaryListed && job.salaryMax == null && job.salaryMin == null) return "no_salary";
  if (filters.levels?.length && !filters.levels.includes(job.seniority)) return "level";
  if (filters.company?.trim() && !job.company.toLowerCase().includes(filters.company.trim().toLowerCase())) return "company";
  if (filters.locations?.length && !inPlaces(job, filters.locations)) return "location";
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
): FilterResult {
  const query = filters.query.trim();
  const visibleIds: string[] = [];
  const scores: Record<string, number> = {};
  const hiddenByReason: Partial<Record<FilterReason, number>> = {};
  let totalCatalog = 0;

  for (const id of order) {
    const j = jobs[id];
    if (!j) continue; // not a catalog gap the candidate can act on — the id is simply stale
    totalCatalog++;
    const reason = firstFailedReason(j, matches[id], rejected[id], !!saved[id], filters, query, now, (r) => (scores[id] = r));
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
export const FILTER_REASON_FIX: Record<FilterReason, { showAnyway: Partial<JobFilters> | "unreject"; preference: { label: string; href: string } }> = {
  rejected: { showAnyway: "unreject", preference: { label: "Review what Wonder learned", href: "/app/career-dna" } },
  not_saved: { showAnyway: { onlySaved: false }, preference: { label: "See all jobs", href: "/app/jobs" } },
  work_mode: { showAnyway: { workModes: [] }, preference: { label: "Change work modes", href: "/app/career-dna" } },
  source: { showAnyway: { sourceIds: [] }, preference: { label: "Change sources", href: "/app/jobs" } },
  min_fit: { showAnyway: { minFit: null }, preference: { label: "Change minimum fit", href: "/app/jobs" } },
  freshness: { showAnyway: { freshnessDays: null }, preference: { label: "Change how recent", href: "/app/jobs" } },
  min_salary: { showAnyway: { minSalary: undefined }, preference: { label: "Change minimum salary", href: "/app/career-dna" } },
  no_salary: { showAnyway: { salaryListed: false }, preference: { label: "Change filters", href: "/app/jobs" } },
  level: { showAnyway: { levels: [] }, preference: { label: "Change filters", href: "/app/jobs" } },
  company: { showAnyway: { company: "" }, preference: { label: "Change filters", href: "/app/jobs" } },
  location: { showAnyway: { locations: [] }, preference: { label: "Change your places", href: "/app/career-dna" } },
  search_text: { showAnyway: { query: "" }, preference: { label: "Change the search", href: "/app/jobs" } },
};
