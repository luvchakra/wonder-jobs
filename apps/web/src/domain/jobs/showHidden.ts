import type { FilterReason, FilterResult } from "./filterExplain";
import type { FindMode } from "./findMode";

/**
 * "Show hidden" (owner, 2026-11-26: "give option to show hidden"): the jobs the list's filters hide, shown in place
 * with why each was hidden. A view choice only: Refine and the Career Profile are unchanged, and it resets on the
 * next search or mode switch. Jobs marked "not for me" stay hidden: that's undone from the job itself.
 */

/** A hidden job's tag: why it was hidden, in a couple of words. */
export const HIDDEN_TAG: Record<FilterReason, string> = {
  rejected: "Not for me",
  not_saved: "Not saved",
  too_old: "Older posting",
  work_mode: "Other work mode",
  source: "Other source",
  min_fit: "Below your fit",
  freshness: "Older than you picked",
  min_salary: "Below your salary",
  no_salary: "No pay listed",
  level: "Other level",
  job_type: "Other job type",
  other_mode: "Other mode",
  company: "Other company",
  location: "Other place",
  profile: "Outside your field",
  in_pipeline: "Already in Pipeline",
  search_text: "Doesn't match your words",
  worldwide_remote: "Worldwide remote",
  duplicate: "Duplicate",
};

/** Reasons the Career Profile's preferences control: only these make "Update Career Profile preferences" useful. */
const PREFERENCE_REASONS: FilterReason[] = ["work_mode", "location", "worldwide_remote", "min_salary", "no_salary", "level", "min_fit", "profile", "freshness", "job_type"];

/** The hidden jobs "Show hidden" brings back, best match first (never the ones marked not for me). */
export function revealedIds(result: FilterResult, score: (id: string) => number): string[] {
  return Object.keys(result.hiddenReason)
    .filter((id) => result.hiddenReason[id] !== "rejected" && result.hiddenReason[id] !== "duplicate")
    .sort((a, b) => score(b) - score(a));
}

/** The button's words: the one reason when there's one ("Show 19 part-time"), else how many are hidden. */
export function showHiddenLabel(result: FilterResult, mode: FindMode): string | null {
  const n = Object.values(result.hiddenReason).filter((r) => r !== "rejected" && r !== "duplicate").length;
  if (!n) return null;
  const reasons = Object.keys(result.hiddenByReason).filter((r) => r !== "rejected" && r !== "duplicate" && result.hiddenByReason[r as FilterReason]);
  if (reasons.length === 1 && reasons[0] === "other_mode") return `Show ${n} ${mode === "full_time" ? "part-time" : "full-time"}`;
  return `Show ${n} hidden`;
}

/** A hidden job's tag; for the other mode, its kind ("Part time", "Full time"). */
export function hiddenTag(reason: FilterReason, mode: FindMode): string {
  return reason === "other_mode" ? (mode === "full_time" ? "Part time" : "Full time") : HIDDEN_TAG[reason];
}

/** Whether any hidden job is hidden by something the Career Profile's preferences set. */
export const preferencesHide = (result: FilterResult) => PREFERENCE_REASONS.some((r) => result.hiddenByReason[r]);
