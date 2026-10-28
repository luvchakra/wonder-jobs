import type { FitLabel, JobFilters, JobSort } from "./types";
import { JOB_TYPES, type JobType } from "./jobType";

/**
 * Find's two modes (owner, 2026-10-22), switched by the slider at the top of the page.
 * - Full Time: the Career Profile's own search. What it is looking for and one "Search based on Career
 *   Profile" (its "Career Profile" opens the profile).
 * - Part Time: only what the candidate types, with the job types it narrows by (Contract, Consultant,
 *   Internship, Short-term, Gig). The profile's role, places, work modes and minimum salary are left out
 *   (the filters' `skipProfile`).
 * - Internships (WonderStar's first module beyond Jobs, WJ-413): typed words like Part Time, searched as internships,
 *   and only internships listed — a posting that says it's an internship (its type, or Intern/Trainee/Apprentice in
 *   the title), never one that states no type.
 * Both: a row of job types (each mode its own, `MODE_JOB_TYPES`); the views All, Strong and For you; Hide Pipeline and Refine.
 */
export type FindMode = "full_time" | "part_time" | "internships";

export const FIND_MODES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "internships", label: "Internships" },
] as const satisfies readonly { value: FindMode; label: string }[];

export const findModeOf = (f: Pick<JobFilters, "skipProfile" | "internships">): FindMode => (f.internships ? "internships" : f.skipProfile ? "part_time" : "full_time");

/** Part Time and Internships search what's typed; Full Time the Career Profile. */
export const isWordsMode = (m: FindMode): boolean => m !== "full_time";

/** Was this catalog searched in Internships (its words carry the internship ask — `internshipWords`)? */
export const isInternshipSearch = (searchedFor: string): boolean => /\b(intern|internships?|trainee(ship)?|apprentice(ship)?)\b/i.test(searchedFor);

/** What Internships searches for the words typed: the words, asked as internships ("product design" → "product design internship"). */
export const internshipWords = (text: string): string => (isInternshipSearch(text) ? text.trim() : `${text.trim()} internship`);

/** What switching to a mode changes; the list starts from All in either. */
export const FIND_MODE_PATCH: Record<FindMode, Partial<JobFilters>> = {
  // Back to the profile: its places again, nothing typed, no job-type narrowing.
  full_time: { skipProfile: false, internships: false, locations: undefined, query: "", jobTypes: [], minFit: null, exactFit: false },
  // Only the words: anywhere unless typed, every job type until one is picked.
  part_time: { skipProfile: true, internships: false, strictProfile: false, locations: [], jobTypes: [], minFit: null, exactFit: false },
  // Words too, its own box (it starts empty); internships only, so no job-type row.
  internships: { skipProfile: true, internships: true, strictProfile: false, locations: [], query: "", jobTypes: [], minFit: null, exactFit: false },
};

/** The job types Part Time narrows by (owner, 2026-10-22: not Full-time or Part-time itself). */
export const PART_TIME_JOB_TYPES: JobType[] = ["contract", "consultant", "internship", "temporary", "gig"];

/**
 * The job types Full Time narrows by (owner, 2026-10-22: a row in both modes, its own options): the
 * engagements a career move is made on — the job boards' own full-time filters (permanent, contract,
 * fixed-term) and Consultant. Internships and gigs are Part Time's.
 */
export const FULL_TIME_JOB_TYPES: JobType[] = ["full_time", "contract", "consultant", "temporary"];

export const MODE_JOB_TYPES: Record<FindMode, JobType[]> = { full_time: FULL_TIME_JOB_TYPES, part_time: PART_TIME_JOB_TYPES, internships: [] };

/**
 * What each mode's All covers (owner, 2026-10-22: freelance gigs were showing in Full Time). Full Time: its own job
 * types — gigs, part-time jobs and internships are left out. Part Time: every type but full-time (owner, 2026-10-24:
 * full-time jobs were showing in Part Time). A job that states no type at all (most employer career pages don't)
 * shows in both.
 */
export const MODE_COVERS: Record<FindMode, JobType[]> = { full_time: FULL_TIME_JOB_TYPES, part_time: JOB_TYPES.filter((t) => t !== "full_time"), internships: ["internship"] };
/** Internships lists only postings that say they are one; the other modes also show a posting that states no type. */
export const inMode = (t: JobType | undefined, mode: FindMode): boolean => (t ? MODE_COVERS[mode].includes(t) : mode !== "internships");

/** A chip's own word: in Full Time, "Full-time" would only repeat the mode, so it reads "Permanent". */
export const modeJobTypeLabel = (t: JobType, label: string): string => (t === "full_time" ? "Permanent" : label);

/**
 * What the candidate set in Refine — the view, job types, places, sort and the narrowing filters — kept for
 * each mode separately and between sessions (owner, 2026-10-22; places, job types and view too, 2026-10-23):
 * switching modes, or coming back later, brings back that mode's own settings. `locations` undefined is Full
 * Time's "your Career Profile's places" (so a change to the profile still flows through); a list is what was picked.
 */
export type RefineSettings = Required<Pick<JobFilters, "workModes" | "levels" | "company" | "salaryListed" | "strictProfile" | "hideInPipeline" | "sourceIds" | "freshnessDays">> &
  Pick<JobFilters, "minSalary" | "locations"> & { sort: JobSort; jobTypes: JobType[]; minFit: FitLabel | null; exactFit: boolean };

/** A mode nothing was set in yet: Refine as it starts. */
export const DEFAULT_REFINE: RefineSettings = { workModes: [], levels: [], company: "", salaryListed: false, strictProfile: false, hideInPipeline: false, sourceIds: [], freshnessDays: null, minSalary: undefined, sort: "best_match", locations: undefined, jobTypes: [], minFit: null, exactFit: false };

/** Each mode's start: Full Time the profile's places, Part Time and Internships anywhere. */
export const refineDefaults = (mode: FindMode): RefineSettings => ({ ...DEFAULT_REFINE, locations: isWordsMode(mode) ? [] : undefined });

export const refineOf = (f: JobFilters, sort: JobSort): RefineSettings => ({
  locations: f.locations,
  jobTypes: f.jobTypes ?? [],
  minFit: f.minFit ?? null,
  exactFit: !!f.exactFit,
  workModes: f.workModes,
  levels: f.levels ?? [],
  company: f.company ?? "",
  salaryListed: !!f.salaryListed,
  strictProfile: !!f.strictProfile,
  hideInPipeline: !!f.hideInPipeline,
  sourceIds: f.sourceIds,
  freshnessDays: f.freshnessDays ?? null,
  minSalary: f.minSalary,
  sort,
});

export const sameRefine = (a: RefineSettings | undefined, b: RefineSettings): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);

/** Read back from storage: only the known fields, with their types, and Refine's start for anything else. */
export function readRefine(raw: unknown): RefineSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    workModes: strings(r.workModes) as RefineSettings["workModes"],
    levels: strings(r.levels) as RefineSettings["levels"],
    company: typeof r.company === "string" ? r.company : "",
    salaryListed: r.salaryListed === true,
    // "Search strictly within your Career Profile" left Refine (owner, 2026-10-24): never restored on.
    strictProfile: false,
    hideInPipeline: r.hideInPipeline === true,
    sourceIds: strings(r.sourceIds),
    freshnessDays: typeof r.freshnessDays === "number" ? r.freshnessDays : null,
    minSalary: typeof r.minSalary === "number" ? r.minSalary : undefined,
    sort: r.sort === "date" || r.sort === "salary" ? r.sort : "best_match",
    locations: Array.isArray(r.locations) ? strings(r.locations) : undefined,
    jobTypes: strings(r.jobTypes).filter((t): t is JobType => (JOB_TYPES as readonly string[]).includes(t)),
    minFit: r.minFit === "strong" || r.minFit === "worth_considering" || r.minFit === "stretch" || r.minFit === "low_fit" ? r.minFit : null,
    exactFit: r.exactFit === true,
  };
}
