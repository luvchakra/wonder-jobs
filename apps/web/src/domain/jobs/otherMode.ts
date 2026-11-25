import type { CanonicalJob, JobFilters } from "./types";
import type { FilterResult } from "./filterExplain";
import { FIND_MODE_PATCH, findModeOf, inMode, refineDefaults, type FindMode, type RefineSettings } from "./findMode";
import { jobTypeOf } from "./jobType";

/**
 * "Also full-time" under Part Time's results, and "Also part-time" under Full Time's (owner, 2026-11-23): the same
 * words' jobs the other mode shows, from the catalog already on screen — nothing is searched again.
 */
export const otherModeOf = (m: FindMode): FindMode => (m === "full_time" ? "part_time" : "full_time");

/** The filters the other mode applies once switched to (the store's `switchFindMode`, with its own Refine kept), with the same words typed. */
export function otherModeFilters(f: JobFilters, refine: Partial<Record<FindMode, RefineSettings>>): JobFilters {
  const to = otherModeOf(findModeOf(f));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- sort is the store's, not a filter
  const { sort, ...narrowing } = refine[to] ?? refineDefaults(to);
  return { ...f, ...FIND_MODE_PATCH[to], ...narrowing, query: f.query };
}

export interface AlsoInOtherMode {
  mode: FindMode;
  /** The other mode's jobs for these words that this mode leaves out (a job that states no type shows in both, so it's not here). */
  ids: string[];
  /** Every job the other mode shows for these words: what "See all" opens. */
  all: number;
}

/** What the other mode shows that this one hides, from the two modes' own filter results over the same catalog. */
export function alsoInOtherMode(here: FindMode, there: FilterResult, jobs: Record<string, CanonicalJob>): AlsoInOtherMode {
  const ids = there.visibleIds.filter((id) => jobs[id] && !inMode(jobTypeOf(jobs[id]), here));
  return { mode: otherModeOf(here), ids, all: there.visibleIds.length };
}

const KIND: Record<FindMode, string> = { full_time: "full-time", part_time: "part-time" };
const MODE_NAME: Record<FindMode, string> = { full_time: "Full Time", part_time: "Part Time" };
const n = (x: number) => x.toLocaleString("en-IN");

/** The words, and what the list and its links say about the other mode's jobs. Every number is a count of jobs in the catalog. */
export function otherModeCopy(here: FindMode, also: AlsoInOtherMode, words: string) {
  const k = also.ids.length;
  const w = words.trim();
  return {
    emptyTitle: `No ${KIND[here]} roles${w ? ` for “${w}”` : ""}`,
    emptyBody: `${n(k)} ${KIND[also.mode]} ${k === 1 ? "role" : "roles"} found — ${k === 1 ? "it's" : "they're"} below.`,
    divider: `Also ${KIND[also.mode]} · ${n(k)}${w ? ` for “${w}”` : ""}`,
    seeAll: `See all ${n(also.all)} in ${MODE_NAME[also.mode]} Jobs`,
  };
}
