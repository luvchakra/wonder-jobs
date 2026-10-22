import type { JobFilters } from "./types";
import { JOB_TYPES, type JobType } from "./jobType";

/**
 * Find's two modes (owner, 2026-10-22), switched by the slider at the top of the page.
 * - Full Time: the Career Profile's own search. What it is looking for, one "Search based on Career Profile"
 *   and the views All and For you.
 * - Part Time: only what the candidate types, with the job types a part-time search narrows by (Part-time,
 *   Contract, Internship, Short-term, Gig) and the views All and Strong. The profile's role, places, work
 *   modes and minimum salary are left out (the filters' `skipProfile`).
 * Hide Pipeline and Refine are in both.
 */
export type FindMode = "full_time" | "part_time";

export const FIND_MODES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
] as const satisfies readonly [{ value: FindMode; label: string }, { value: FindMode; label: string }];

export const findModeOf = (f: Pick<JobFilters, "skipProfile">): FindMode => (f.skipProfile ? "part_time" : "full_time");

/** What switching to a mode changes; the list starts from All in either. */
export const FIND_MODE_PATCH: Record<FindMode, Partial<JobFilters>> = {
  // Back to the profile: its places again, nothing typed, no job-type narrowing.
  full_time: { skipProfile: false,locations: undefined, query: "", jobTypes: [], minFit: null, exactFit: false },
  // Only the words: anywhere unless typed, every job type until one is picked.
  part_time: { skipProfile: true, strictProfile: false, locations: [], jobTypes: [], minFit: null, exactFit: false },
};

/** The views each mode offers beside All. */
export const FIND_MODE_VIEWS: Record<FindMode, ("all" | "for_you" | "strong")[]> = {
  full_time: ["all", "for_you"],
  part_time: ["all", "strong"],
};

/** The job types Part Time narrows by: every one but Full-time. */
export const PART_TIME_JOB_TYPES: JobType[] = JOB_TYPES.filter((t) => t !== "full_time");
