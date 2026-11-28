import type { CareerDNA } from "@/domain/career/types";
import type { CareerRole } from "@/domain/career/roles";
import { fileRoleSkills } from "@/domain/career/roleFile";

/**
 * The role files read this session, by "kind:id" (a replaced file is another id), so ranking can use a role's file
 * skills without waiting (owner, 2026-11-28: a role-search ranks with its file's skills, not the role's old copy).
 * Filled by `lib/useRoleFile.ts::loadRoleFile`; at most a few kept.
 */
const MAX = 8;
const read = new Map<string, CareerDNA>();
const keyOf = (ref: NonNullable<CareerRole["baseResume"]>) => `${ref.kind}:${ref.id}`;

export function rememberRoleFile(ref: NonNullable<CareerRole["baseResume"]>, dna: CareerDNA) {
  read.delete(keyOf(ref));
  read.set(keyOf(ref), dna);
  while (read.size > MAX) read.delete(read.keys().next().value!);
}

/** A role as it ranks: with its own résumé read, the file's skills (less those taken off, plus those added by hand). */
export function roleWithFileSkills<R extends Pick<CareerRole, "baseResume" | "skills" | "skillsOwn" | "skillsRemoved">>(role: R | undefined, mySkills: CareerDNA["skills"]): R | undefined {
  const file = role?.baseResume ? read.get(keyOf(role.baseResume)) : undefined;
  return role && file ? { ...role, skills: fileRoleSkills(file.skills, role, mySkills) } : role;
}
