import { roleSearch, type CareerRole } from "@/domain/career/roles";
import { defaultSearchQuery } from "./normalize";

/**
 * What a role's search is scored against (owner, 2026-11-25: searching as "Reinsurance" ranked IAM engineering
 * jobs first, because its jobs were scored with My profile's goal and headline). A role's jobs are judged on the
 * role's own search words and goal, as a typed search is on its words; skills, level, place and pay still come
 * from the one Career Profile.
 */
export interface RoleScope {
  title: string;
  /** The role's search words: the posting is judged on answering them. */
  query: string;
  /** The role's goal, for fit. */
  careerGoal: string;
}

export function roleScope(role: Pick<CareerRole, "title" | "query" | "goal">): RoleScope {
  const { query, careerGoal } = roleSearch(role, defaultSearchQuery);
  return { title: role.title.trim(), query, careerGoal };
}

/** The role a job was found as, when the candidate still has it. */
export function scopeForJob(job: { foundAs?: { id: string } }, roles: CareerRole[] | undefined): RoleScope | undefined {
  const role = job.foundAs ? roles?.find((r) => r.id === job.foundAs!.id) : undefined;
  return role ? roleScope(role) : undefined;
}

/** Part of the AI read's key: a changed role (or another one) never reuses an earlier read. */
export const roleKey = (r: RoleScope | undefined) => (r ? `${r.title}|${r.query}|${r.careerGoal}`.toLowerCase() : "");

/** The words a search's jobs are judged on answering: what was typed, or a role's own search words. Undefined for the profile's search. */
export function searchWordsOf(config: { origin?: "profile" | "words"; searchCriteria: { query: string } }): string | undefined {
  return config.origin === "words" && config.searchCriteria.query.trim() ? config.searchCriteria.query : undefined;
}
