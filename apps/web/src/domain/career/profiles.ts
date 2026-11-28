import type { CareerDNA } from "./types";
import type { CareerRole } from "./roles";

/**
 * A profile as a search and its scoring see it (owner, 2026-11-26: "make all profile options equivalent"): My profile
 * itself, or a role's own goal and skills over My profile's, each unset one following My profile. Level, places, work
 * mode and salary are Refine's (owner, 2026-11-28), never a profile's: a role's stored ones are moved there
 * (`domain/jobs/profileRefine.ts`) and not read here. Current role, years, history, strengths and industries are the
 * whole Career Profile's.
 */
export function effectiveProfile(dna: CareerDNA, role?: Pick<CareerRole, "title" | "goal" | "skills">): CareerDNA {
  if (!role) return dna;
  return {
    ...dna,
    careerGoal: role.goal.trim() || role.title.trim(),
    skills: role.skills?.length ? role.skills : dna.skills,
  };
}

/** A new role's own fields, prefilled from My profile's (owner: "Add a role opens a new profile … prefilled"). */
export function prefilledRole(dna: CareerDNA, title: string) {
  return { title, query: "", goal: "", skills: dna.skills };
}

/** A name not yet used by a role: "New profile", then "New profile 2", … */
export function newProfileTitle(roles: { title: string }[]): string {
  const taken = new Set(roles.map((r) => r.title.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const t = n === 1 ? "New profile" : `New profile ${n}`;
    if (!taken.has(t.toLowerCase())) return t;
  }
}

/**
 * The profile a job's résumé, cover letter and answers are drafted from (owner, 2026-11-26: "when it generated the
 * custom resume, it still picked the other profile"): the role whose search found the job, else My profile. A role's
 * own fields as in `effectiveProfile`, and its Role you want as the résumé's headline. Work history, education,
 * contact and strengths are the whole Career Profile's.
 */
export function draftingProfile(dna: CareerDNA, role?: Pick<CareerRole, "title" | "query" | "goal" | "skills">): CareerDNA {
  if (!role) return dna;
  return { ...effectiveProfile(dna, role), headline: role.goal.trim() || role.title.trim() };
}
