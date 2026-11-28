import type { CareerDNA } from "@/domain/career/types";
import type { CareerRole } from "@/domain/career/roles";
import type { Job, JobFilters, WorkMode } from "./types";

/**
 * Refine is the one place for level, location, salary and work mode (owner, 2026-11-28: "remove any duplicate search
 * option from profile section of its already present in refine section"). Full Time keeps these four for each profile
 * (My profile is "", a role its id): picking a profile under Search as brings back its own, and a search as it uses
 * them. A role's level, places, salary and work mode stored before this move into its choices once, the first time
 * it's used — only the ones it set differently from My profile (a copy taken when the role was made isn't a choice).
 */
export type ProfileRefine = { locations?: string[]; workModes: WorkMode[]; levels: Job["seniority"][]; minSalary?: number };
export type ProfileRefines = Record<string, ProfileRefine>;

/** My profile and up to six roles, with room for one more. */
export const MAX_PROFILE_REFINES = 8;
export const MY_PROFILE = "";

const LEVELS: readonly Job["seniority"][] = ["junior", "mid", "senior", "lead", "director"];
const MODES: readonly WorkMode[] = ["remote", "hybrid", "onsite"];
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

export const profileRefineOf = (f: Pick<JobFilters, "locations" | "workModes" | "levels" | "minSalary">): ProfileRefine => ({
  locations: f.locations,
  workModes: f.workModes,
  levels: f.levels ?? [],
  minSalary: f.minSalary,
});

/** The patch that puts a profile's choices into Find's filters. */
export const refinePatch = (r: ProfileRefine): Pick<JobFilters, "locations" | "workModes" | "levels" | "minSalary"> => ({ locations: r.locations, workModes: r.workModes, levels: r.levels, minSalary: r.minSalary });

/** Read back from storage: known fields and types only, at most `MAX_PROFILE_REFINES` profiles. */
export function readProfileRefines(raw: unknown): ProfileRefines {
  if (!raw || typeof raw !== "object") return {};
  const out: ProfileRefines = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_PROFILE_REFINES)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    out[k.slice(0, 80)] = {
      locations: Array.isArray(r.locations) ? strings(r.locations) : undefined,
      workModes: strings(r.workModes).filter((m): m is WorkMode => (MODES as readonly string[]).includes(m)),
      levels: strings(r.levels).filter((l): l is Job["seniority"] => (LEVELS as readonly string[]).includes(l)),
      minSalary: typeof r.minSalary === "number" && r.minSalary > 0 ? r.minSalary : undefined,
    };
  }
  return out;
}

const same = (a: readonly string[] | undefined, b: readonly string[] | undefined) => JSON.stringify([...(a ?? [])].map((s) => s.trim().toLowerCase()).sort()) === JSON.stringify([...(b ?? [])].map((s) => s.trim().toLowerCase()).sort());

/**
 * A role's first choices: My profile's, with what the role had set differently from My profile's own fields put
 * over them — its places, work modes, level (as Refine's Level) and minimum salary.
 */
export function seededRefine(mine: ProfileRefine, role: Pick<CareerRole, "seniority" | "preferredLocations" | "workModes" | "minSalary"> | undefined, dna: Pick<CareerDNA, "seniority" | "preferredLocations" | "workModes" | "minSalary">): ProfileRefine {
  if (!role) return mine;
  const places = role.preferredLocations?.map((p) => p.trim()).filter(Boolean) ?? [];
  return {
    locations: places.length && !same(places, dna.preferredLocations) ? places : mine.locations,
    workModes: role.workModes?.length && !same(role.workModes, dna.workModes) ? [...role.workModes] : mine.workModes,
    levels: role.seniority && role.seniority !== dna.seniority ? [role.seniority] : mine.levels,
    minSalary: role.minSalary != null && role.minSalary > 0 && role.minSalary !== dna.minSalary ? role.minSalary : mine.minSalary,
  };
}

/**
 * Switch Full Time's Refine from one profile to another: what's on screen is kept as the profile in use's choices,
 * and the next profile's come back (seeded from its stored fields the first time). Profiles no longer known are
 * dropped once the map is over its cap.
 */
export function switchProfileRefine(
  s: { filters: JobFilters; profileRefine: ProfileRefines; refineProfile: string },
  to: string,
  ctx: { roles: CareerRole[]; dna: Pick<CareerDNA, "seniority" | "preferredLocations" | "workModes" | "minSalary"> },
): { profileRefine: ProfileRefines; refineProfile: string; patch?: ReturnType<typeof refinePatch> } {
  // A role not known (yet, or any more) is never switched to: its stored fields would be missed.
  if (to !== MY_PROFILE && !ctx.roles.some((r) => r.id === to)) return { profileRefine: s.profileRefine, refineProfile: s.refineProfile };
  const kept: ProfileRefines = { ...s.profileRefine, [s.refineProfile]: profileRefineOf(s.filters) };
  if (Object.keys(kept).length > MAX_PROFILE_REFINES) {
    const known = new Set([MY_PROFILE, to, s.refineProfile, ...ctx.roles.map((r) => r.id)]);
    for (const k of Object.keys(kept)) if (!known.has(k)) delete kept[k];
  }
  if (to === s.refineProfile) return { profileRefine: kept, refineProfile: to };
  const next = kept[to] ?? seededRefine(kept[MY_PROFILE] ?? profileRefineOf(s.filters), ctx.roles.find((r) => r.id === to), ctx.dna);
  return { profileRefine: { ...kept, [to]: next }, refineProfile: to, patch: refinePatch(next) };
}

/**
 * The level a job is judged against (owner: Refine is the one place for level): the one the search's words name,
 * else the Level picked in Refine nearest the job's, else the level of your Current role. None of them: no level is
 * preferred.
 */
export function targetLevel(job: Pick<Job, "seniority">, wordsLevel: Job["seniority"] | undefined, levels: readonly Job["seniority"][] | undefined, currentRoleLevel: Job["seniority"] | undefined): { level: Job["seniority"]; from: "words" | "refine" | "current_role" } | undefined {
  if (wordsLevel) return { level: wordsLevel, from: "words" };
  if (levels?.length) {
    const rank = (l: Job["seniority"]) => LEVELS.indexOf(l);
    const nearest = [...levels].sort((a, b) => Math.abs(rank(a) - rank(job.seniority)) - Math.abs(rank(b) - rank(job.seniority)))[0]!;
    return { level: nearest, from: "refine" };
  }
  return currentRoleLevel ? { level: currentRoleLevel, from: "current_role" } : undefined;
}
