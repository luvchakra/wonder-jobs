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

const places = (list: string[]) => list.map((p) => p.trim()).filter(Boolean);

/** My profile's own fields, as the form shows them. */
export function mainFields(dna: CareerDNA, baseResume?: BaseResumeRef): ProfileFieldsValue {
  return { searchWords: dna.searchWords ?? "", goal: dna.careerGoal, seniority: dna.seniority, resume: refKey(baseResume), places: dna.preferredLocations, workModes: dna.workModes, minSalary: dna.minSalary, skills: dna.skills };
}

/** My profile with the form's fields put back (its shared parts untouched). */
export function withMainFields(dna: CareerDNA, v: ProfileFieldsValue): CareerDNA {
  return { ...dna, searchWords: v.searchWords.trim() || undefined, careerGoal: v.goal, seniority: v.seniority ?? dna.seniority, preferredLocations: places(v.places), workModes: v.workModes, minSalary: v.minSalary, skills: v.skills };
}

/** A role's own fields, as the form shows them: what isn't set is empty (it follows My profile). */
export function roleFieldsOf(role: CareerRole): ProfileFieldsValue {
  return { searchWords: role.query, goal: role.goal, seniority: role.seniority, resume: refKey(role.baseResume), places: role.preferredLocations ?? [], workModes: role.workModes ?? [], minSalary: role.minSalary, skills: role.skills ?? [] };
}

/** What Save writes for a role: its name and the form's fields. */
export function roleInputOf(title: string, v: ProfileFieldsValue): RoleInput {
  return { title, query: v.searchWords, goal: v.goal, baseResume: refOf(v.resume), seniority: v.seniority, skills: v.skills, preferredLocations: places(v.places), workModes: v.workModes, minSalary: v.minSalary };
}

/** Whether a form's fields differ from what's saved. */
export const fieldsChanged = (a: ProfileFieldsValue, b: ProfileFieldsValue) => JSON.stringify({ ...a, places: places(a.places), searchWords: a.searchWords.trim() }) !== JSON.stringify({ ...b, places: places(b.places), searchWords: b.searchWords.trim() });

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
