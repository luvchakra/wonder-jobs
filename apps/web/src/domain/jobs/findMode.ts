import type { JobFilters } from "./types";
import type { JobType } from "./jobType";

/**
 * Find's two modes (owner, 2026-10-22), switched by the slider at the top of the page.
 * - Full Time: the Career Profile's own search. What it is looking for and one "Search based on Career
 *   Profile" (its "Career Profile" opens the profile).
 * - Part Time: only what the candidate types, with the job types it narrows by (Contract, Consultant,
 *   Internship, Short-term, Gig). The profile's role, places, work modes and minimum salary are left out
 *   (the filters' `skipProfile`).
 * Both: a row of job types (each mode its own, `MODE_JOB_TYPES`); the views All, Strong and For you; Hide Pipeline and Refine.
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
  full_time: { skipProfile: false, locations: undefined, query: "", jobTypes: [], minFit: null, exactFit: false },
  // Only the words: anywhere unless typed, every job type until one is picked.
  part_time: { skipProfile: true, strictProfile: false, locations: [], jobTypes: [], minFit: null, exactFit: false },
};

/** The job types Part Time narrows by (owner, 2026-10-22: not Full-time or Part-time itself). */
export const PART_TIME_JOB_TYPES: JobType[] = ["contract", "consultant", "internship", "temporary", "gig"];

/**
 * The job types Full Time narrows by (owner, 2026-10-22: a row in both modes, its own options): the
 * engagements a career move is made on — the job boards' own full-time filters (permanent, contract,
 * fixed-term) and Consultant. Internships and gigs are Part Time's.
 */
export const FULL_TIME_JOB_TYPES: JobType[] = ["full_time", "contract", "consultant", "temporary"];

export const MODE_JOB_TYPES: Record<FindMode, JobType[]> = { full_time: FULL_TIME_JOB_TYPES, part_time: PART_TIME_JOB_TYPES };

/** A chip's own word: in Full Time, "Full-time" would only repeat the mode, so it reads "Permanent". */
export const modeJobTypeLabel = (t: JobType, label: string): string => (t === "full_time" ? "Permanent" : label);
