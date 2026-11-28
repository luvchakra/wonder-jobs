import type { CareerDNA } from "@/domain/career/types";
import type { CareerRole, RoleInput } from "@/domain/career/roles";
import type { BaseResumeRef } from "@/domain/resume/files";
import type { ProfileFieldsValue } from "./ProfileFields";

/** A résumé reference as a select's value, and back. */
export const refKey = (r?: BaseResumeRef) => (r ? `${r.kind}:${r.id}` : "");
export const refOf = (k: string): BaseResumeRef | undefined => {
  const [kind, id] = k.split(":");
  return (kind === "upload" || kind === "saved") && id ? { kind, id } : undefined;
};

/**
 * My profile's own fields, as the form shows them. Level, places, salary and work mode aren't a profile's any more:
 * they're Refine's (owner, 2026-11-28), kept for each profile there (`domain/jobs/profileRefine.ts`).
 */
export function mainFields(dna: CareerDNA, baseResume?: BaseResumeRef): ProfileFieldsValue {
  return { searchWords: dna.searchWords ?? "", goal: dna.careerGoal, resume: refKey(baseResume), skills: dna.skills };
}

/** My profile with the form's fields put back (its shared parts untouched). */
export function withMainFields(dna: CareerDNA, v: ProfileFieldsValue): CareerDNA {
  return { ...dna, searchWords: v.searchWords.trim() || undefined, careerGoal: v.goal, skills: v.skills };
}

/** A role's own fields, as the form shows them: what isn't set is empty (it follows My profile). */
export function roleFieldsOf(role: CareerRole): ProfileFieldsValue {
  return { searchWords: role.query, goal: role.goal, resume: refKey(role.baseResume), skills: role.skills ?? [], ...(role.skillsOwn ? { skillsOwn: true } : {}), ...(role.skillsRemoved?.length ? { skillsRemoved: role.skillsRemoved } : {}) };
}

/**
 * What Save writes for a role: its name and the form's fields. A level, places, salary or work mode it was saved
 * with before they moved to Refine are kept as they were, until they're moved into its Refine choices.
 */
export function roleInputOf(title: string, v: ProfileFieldsValue, before?: Pick<CareerRole, "seniority" | "preferredLocations" | "workModes" | "minSalary">): RoleInput {
  return { title, query: v.searchWords, goal: v.goal, baseResume: refOf(v.resume), skills: v.skills, skillsOwn: v.skillsOwn, skillsRemoved: v.skillsRemoved, seniority: before?.seniority, preferredLocations: before?.preferredLocations, workModes: before?.workModes, minSalary: before?.minSalary };
}

/** Whether a form's fields differ from what's saved. */
export const fieldsChanged = (a: ProfileFieldsValue, b: ProfileFieldsValue) => JSON.stringify({ ...a, searchWords: a.searchWords.trim() }) !== JSON.stringify({ ...b, searchWords: b.searchWords.trim() });

/**
 * The skills with what was typed in the add box put in (owner, 2026-11-26: "clicking outside should add the new
 * skill"): commas separate several, each trimmed; empty ones and ones already there (any case) are skipped. New
 * skills start as ordinary ones (level 3).
 */
export function addSkills(skills: CareerDNA["skills"], typed: string): CareerDNA["skills"] {
  const out = [...skills];
  for (const raw of typed.split(",")) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (name && !out.some((s) => s.name.toLowerCase() === name.toLowerCase())) out.push({ name, level: 3 });
  }
  return out.length === skills.length ? skills : out;
}

/** A profile's form with the skill still typed in its add box put in, as Save changes and Search save it. A role
 * whose skills follow My profile's starts from those (`follow`), as its chips show. */
export function withTypedSkill(v: ProfileFieldsValue, typed: string | undefined, follow?: ProfileFieldsValue): ProfileFieldsValue {
  if (!typed?.trim()) return v;
  const shown = v.skills.length ? v.skills : (follow?.skills ?? []);
  const skills = addSkills(shown, typed);
  return skills === shown ? v : { ...v, skills };
}
