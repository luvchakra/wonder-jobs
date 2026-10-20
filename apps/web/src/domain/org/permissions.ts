import type { OrgRole } from "./types";

/**
 * What each role in a hiring workspace may do — the single place that decides it. Every employer and recruiter
 * route checks `can(role, permission)` on the server for the caller's own membership; nothing in the browser
 * is trusted to decide it, and a missing or unknown role can do nothing (fails closed).
 */
export type OrgPermission =
  | "org.manage" // rename, members, invites, roles
  | "jobs.view"
  | "jobs.edit" // post, edit, open, close
  | "talent.search"
  | "shortlist.edit" // add, note, report to hiring managers
  | "shortlist.view"
  | "shortlist.decide" // interview / pass
  | "messages.send"
  | "messages.view";

const MATRIX: Record<OrgRole, readonly OrgPermission[]> = {
  owner: ["org.manage", "jobs.view", "jobs.edit", "talent.search", "shortlist.edit", "shortlist.view", "shortlist.decide", "messages.send", "messages.view"],
  hiring_manager: ["jobs.view", "jobs.edit", "shortlist.view", "shortlist.decide", "messages.view"],
  recruiter: ["jobs.view", "talent.search", "shortlist.edit", "shortlist.view", "messages.send", "messages.view"],
};

export function can(role: OrgRole | undefined | null, permission: OrgPermission): boolean {
  if (!role || !(role in MATRIX)) return false;
  return MATRIX[role].includes(permission);
}

export function permissionsOf(role: OrgRole | undefined | null): OrgPermission[] {
  return role && role in MATRIX ? [...MATRIX[role]] : [];
}

export const ORG_ROLES: OrgRole[] = ["owner", "hiring_manager", "recruiter"];

export function isOrgRole(v: unknown): v is OrgRole {
  return typeof v === "string" && (ORG_ROLES as string[]).includes(v);
}
