/**
 * Career Profile's profiles (owner, 2026-11-25: "design the section so it can show multiple profiles, open and
 * collapse profile in that section based on change"): My profile and each role, one open at a time.
 */
export const MAIN_PROFILE = "main";

/** The profile to open on arrival: the role in `?role=` when the candidate still has it, else My profile. */
export function openedProfile(roleId: string | null | undefined, roles: { id: string }[]): string {
  return roleId && roles.some((r) => r.id === roleId) ? roleId : MAIN_PROFILE;
}

/** The page element for a profile, for scrolling it into view. */
export const profileAnchor = (id: string) => `profile-${id}`;
