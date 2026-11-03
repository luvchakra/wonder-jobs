/**
 * Whether an account already has a profile, from its saved career store (wj.career): onboarding done, a base résumé
 * kept, or any of what onboarding asks for filled in. Onboarding is skipped for such an account (owner, 2026-11-03:
 * "it should identify that the user already has a resume uploaded and it should not show this").
 */
export function hasProfile(state: unknown): boolean {
  const s = (state && typeof state === "object" ? state : {}) as { onboarded?: unknown; baseResume?: unknown; dna?: { headline?: unknown; careerGoal?: unknown; skills?: unknown[]; history?: { experience?: unknown[] } } };
  if (s.onboarded === true || s.baseResume) return true;
  const d = s.dna ?? {};
  return !!(typeof d.headline === "string" && d.headline.trim()) || !!(typeof d.careerGoal === "string" && d.careerGoal.trim()) || (d.skills?.length ?? 0) > 0 || (d.history?.experience?.length ?? 0) > 0;
}
