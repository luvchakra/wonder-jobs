/**
 * Whether a Find result was posted on WonderWorks itself (a company, school, pro, practitioner, organiser or seller here)
 * rather than read from an outside source. For Refine's "WonderWorks only" (owner, 2026-11-03).
 */
export function postedOnWonderWorks(l: unknown): boolean {
  const x = (l && typeof l === "object" ? l : {}) as { origin?: unknown; outside?: unknown };
  if (x.origin === "wonderworks" || x.origin === "wonderstar") return true;
  if (x.origin === "outside") return false;
  if ("outside" in x) return !x.outside;
  return true;
}

/** Refine's key for it, kept with the module's other refinements. */
export const OWN_KEY = "ww";
