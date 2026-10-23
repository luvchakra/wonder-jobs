import type { JobFilters, WorkMode } from "./types";

/**
 * Where, how and for what pay a search looks — what the current mode shows in Refine (owner, 2026-10-23: a
 * search for Dubai and Singapore never runs as "in Remote"; Salary "Any" means any). Work mode and Salary are
 * Refine's alone: none picked is any. Location falls back to the Career Profile's places only in Full Time
 * with none picked (Refine shows them then); Part Time never takes the profile's.
 */
/** "Remote" (or "Anywhere") is a work mode, never a place: a places list of just "Remote" would keep only remote jobs. */
export const placesOnly = (places: string[] | undefined) => places?.filter((p) => !/^(remote|anywhere|worldwide)$/i.test(p.trim()));

export function searchScope(
  refine: Pick<JobFilters, "locations" | "workModes" | "minSalary">,
  profile: { locations: string[]; workModes: WorkMode[]; minSalary?: number },
  given: { locations?: string[]; workModes?: WorkMode[]; skipProfile?: boolean } = {},
): { locations: string[]; workModes: WorkMode[]; minSalary?: number } {
  const skip = !!given.skipProfile;
  return {
    locations: placesOnly(given.locations ?? refine.locations ?? (skip ? [] : profile.locations)) ?? [],
    workModes: given.workModes ?? refine.workModes,
    minSalary: refine.minSalary,
  };
}
