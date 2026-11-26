import type { CareerDNA } from "./types";
import type { CareerRole } from "./roles";

/**
 * A profile as a search and its scoring see it (owner, 2026-11-26: "make all profile options equivalent"): My profile
 * itself, or a role's own goal, level, skills, places, work modes and minimum salary over My profile's, each unset one
 * following My profile. Current role, years, history, strengths and industries are the whole Career Profile's.
 */
export function effectiveProfile(dna: CareerDNA, role?: Pick<CareerRole, "title" | "goal" | "seniority" | "skills" | "preferredLocations" | "workModes" | "minSalary">): CareerDNA {
  if (!role) return dna;
  return {
    ...dna,
    careerGoal: role.goal.trim() || role.title.trim(),
    seniority: role.seniority ?? dna.seniority,
    skills: role.skills?.length ? role.skills : dna.skills,
    preferredLocations: role.preferredLocations?.length ? role.preferredLocations : dna.preferredLocations,
    workModes: role.workModes?.length ? role.workModes : dna.workModes,
    minSalary: role.minSalary ?? dna.minSalary,
  };
}

/** A new role's own fields, prefilled from My profile's (owner: "Add a role opens a new profile … prefilled"). */
export function prefilledRole(dna: CareerDNA, title: string) {
  return { title, query: "", goal: "", seniority: dna.seniority, skills: dna.skills, preferredLocations: dna.preferredLocations, workModes: dna.workModes, minSalary: dna.minSalary };
}

/** A name not yet used by a role: "New profile", then "New profile 2", … */
export function newProfileTitle(roles: { title: string }[]): string {
  const taken = new Set(roles.map((r) => r.title.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const t = n === 1 ? "New profile" : `New profile ${n}`;
    if (!taken.has(t.toLowerCase())) return t;
  }
}
