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

export function applyJobFilters(
  order: string[],
  jobs: Record<string, CanonicalJob>,
  matches: Record<string, JobMatch>,
  rejected: Record<string, string>,
  saved: Record<string, string>,
  filters: JobFilters,
  now: number,
): FilterResult {
  const q = filters.query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const visibleIds: string[] = [];
  const hiddenByReason: Partial<Record<FilterReason, number>> = {};
  let totalCatalog = 0;
  const bump = (reason: FilterReason) => {
    hiddenByReason[reason] = (hiddenByReason[reason] ?? 0) + 1;
  };

  for (const id of order) {
    const j = jobs[id];
    if (!j) continue; // not a catalog gap the candidate can act on — the id is simply stale
    totalCatalog++;
    const m = matches[id];

    if (rejected[id]) {
      bump("rejected");
      continue;
    }
    if (filters.onlySaved && !saved[id]) {
      bump("not_saved");
      continue;
    }
    if (filters.workModes.length && !filters.workModes.includes(j.workMode)) {
      bump("work_mode");
      continue;
    }
    if (filters.sourceIds.length && !j.sourceIds.some((s) => filters.sourceIds.includes(s))) {
      bump("source");
      continue;
    }
    if (filters.minFit && (!m || FIT_RANK[m.fit] < FIT_RANK[filters.minFit])) {
      bump("min_fit");
      continue;
    }
    if (filters.freshnessDays && now - new Date(j.postedAt).getTime() > filters.freshnessDays * DAY) {
      bump("freshness");
      continue;
    }
    if (filters.minSalary && (j.salaryMax == null || (j.currency === "INR" ? j.salaryMax : j.salaryMax * 30) < filters.minSalary)) {
      bump("min_salary");
      continue;
    }
    if (terms.length) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.skills.join(" ")} ${j.tags.join(" ")}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) {
        bump("search_text");
        continue;
      }
    }
    visibleIds.push(id);
  }

  const hiddenTotal = totalCatalog - visibleIds.length;
  return { visibleIds, hiddenByReason, hiddenTotal, totalCatalog };
}
