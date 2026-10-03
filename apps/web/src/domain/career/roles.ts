import type { BaseResumeRef } from "@/domain/resume/files";

/**
 * Roles: the different jobs a candidate is open to — usually ones they've held before ("Product
 * Manager", "Data Analyst"). Each role is a way to search, written by the candidate: its own search
 * terms, its own goal (what goal-alignment is scored against for that search) and, optionally, its own
 * base résumé. Everything else — skills, level, locations, salary — still comes from the one Career
 * Profile, so matching stays honest about who the candidate is. With no roles, nothing changes.
 */
export interface CareerRole {
  id: string;
  /** What the candidate calls it, e.g. "Data Analyst". */
  title: string;
  /** Search terms sent to job sources; empty → derived from the title, never from a default. */
  query: string;
  /** What this search is for, in the candidate's words; empty → the title. */
  goal: string;
  /** The résumé to offer first for jobs this role's searches found. */
  baseResume?: BaseResumeRef;
  createdAt: string;
  updatedAt: string;
}

/** Recorded on a run and on the jobs it found, so the candidate can see which search found what. */
export interface RoleRef {
  id: string;
  title: string;
}

export const MAX_ROLES = 6;

export type RoleInput = Pick<CareerRole, "title" | "query" | "goal"> & { baseResume?: BaseResumeRef };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** What's wrong with a role before it's saved, or null. `others` are the candidate's other roles. */
export function roleProblem(input: RoleInput, others: CareerRole[]): string | null {
  const title = input.title.trim();
  if (title.length < 2) return "Give the role a name, like “Data Analyst”.";
  if (title.length > 80) return "Keep the role name under 80 characters.";
  if (input.query.trim().length > 120) return "Keep the search terms under 120 characters.";
  if (input.goal.trim().length > 300) return "Keep the goal under 300 characters.";
  if (others.some((r) => norm(r.title) === norm(title))) return "You already have a role with that name.";
  return null;
}

export function canAddRole(roles: CareerRole[]): boolean {
  return roles.length < MAX_ROLES;
}

/**
 * The search a role runs: its own terms (or terms read from its title — `deriveQuery` is the same
 * function the Find page uses) and its own goal (or its title). Empty query means the caller asks.
 */
export function roleSearch(role: Pick<CareerRole, "title" | "query" | "goal">, deriveQuery: (from: { headline: string; careerGoal: string }) => string): { careerGoal: string; query: string } {
  const careerGoal = role.goal.trim() || role.title.trim();
  const query = role.query.trim() || deriveQuery({ headline: role.title, careerGoal: role.goal });
  return { careerGoal, query };
}

/** The role that found a job, if the candidate still has it. */
export function roleFor(roles: CareerRole[] | undefined, ref: RoleRef | undefined): CareerRole | undefined {
  return ref ? roles?.find((r) => r.id === ref.id) : undefined;
}

/**
 * The résumé to offer first for a job: the base résumé of the role whose search found it, else the
 * candidate's own base résumé. Never one chosen for them.
 */
export function baseResumeFor(roles: CareerRole[] | undefined, foundAs: RoleRef | undefined, base: BaseResumeRef | undefined): { ref?: BaseResumeRef; role?: CareerRole } {
  const role = roleFor(roles, foundAs);
  if (role?.baseResume) return { ref: role.baseResume, role };
  return { ref: base };
}

/** Clears a role's base résumé when that résumé is deleted. */
export function withoutResume(roles: CareerRole[], ref: BaseResumeRef): CareerRole[] {
  return roles.map((r) => (r.baseResume?.kind === ref.kind && r.baseResume.id === ref.id ? { ...r, baseResume: undefined } : r));
}
