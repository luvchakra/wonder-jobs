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

/** Change on the Looking for pill: the profile searched with, opened on Career Profile (a role's, or My profile's Role you want). */
export function changeHref(roleId?: string): string {
  return roleId ? `/app/career-dna?from=find&role=${encodeURIComponent(roleId)}` : "/app/career-dna?from=find&focus=role";
}

/**
 * The profile Full Time's Search runs as: the one picked under "Search as", else the one the last search ran as, the
 * same one the Looking for pill shows (owner, 2026-11-26: "even though reinsurance is selected when i return to the
 * app later, when i click on the search button, it search for different profile"). A role since deleted is My
 * profile (null). Part Time is left to its own rule (only words typed).
 */
export function fullTimeSearchAs(picked: string | null | false | undefined, lastRoleId: string | undefined, roles: Pick<CareerRole, "id">[]): string | null {
  const known = (id: string | null | false | undefined) => (typeof id === "string" && roles.some((r) => r.id === id) ? id : null);
  return picked !== undefined ? known(picked) : known(lastRoleId);
}

/**
 * What picking a profile under "Search as" does to the list (owner, 2026-11-28: "my profile is selected … still it's
 * showing result for reinsurance, fix properly"): the page never shows one profile's results under another's name.
 * `same`: the list is already that profile's. `restore_profile`: back to My profile, whose own results are kept aside
 * (set aside by the role's search) — they come back at once. `press_search`: anything else — the list is set aside and
 * the page says to press Search, which searches as the picked profile.
 */
export function profileSwitch(picked: string | null, onScreen: string | null, hasProfileCatalog: boolean): "same" | "restore_profile" | "press_search" {
  if (picked === onScreen) return "same";
  return picked === null && hasProfileCatalog ? "restore_profile" : "press_search";
}
