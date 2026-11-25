import type { FindMode } from "@/domain/jobs/findMode";
import { roleSearch, type CareerRole } from "@/domain/career/roles";
import { defaultSearchQuery } from "@/services/jobs/normalize";

/**
 * A role's own Search (Career Profile → Roles) opens Find with `?role=` (owner, 2026-11-25: "i want to search as
 * reinsurance but the profile is not switching"). The role is the search's own: Full Time, with the role picked
 * under "Search as" and on the Looking for pill. Part Time searches only typed words, so it is left for Full Time.
 */
export function roleArrival(roleId: string | null, mode: FindMode, roles: Pick<CareerRole, "id">[]): { roleId: string; leavePartTime: boolean } | null {
  if (!roleId || !roles.some((r) => r.id === roleId)) return null;
  return { roleId, leavePartTime: mode === "part_time" };
}

/** Full Time's Looking for pill: the role searched as (its name, and its search words when they say more), else the profile's own goal. */
export function wantedLine(goal: string, role?: Pick<CareerRole, "title" | "query" | "goal">): string {
  if (!role) return goal.trim();
  const { query } = roleSearch(role, defaultSearchQuery);
  const title = role.title.trim();
  return query && query.toLowerCase() !== title.toLowerCase() ? `${title} · ${query}` : title;
}
