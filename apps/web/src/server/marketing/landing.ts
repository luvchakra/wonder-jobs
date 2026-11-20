/**
 * Which landing page / shows (owner, 2026-11-07: "keep the current landing page as backup that i can activate later"):
 * the quiet one-page version (default) or the full one. Kept under the platform tenant in the state store, like the
 * scheduler settings; only platform admins write it.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

export type LandingChoice = "quiet" | "full";
const KEY = "wj.landing";

export const cleanLandingChoice = (v: unknown): LandingChoice => ((v as { page?: unknown } | null)?.page === "full" ? "full" : "quiet");

/** The page in use; the quiet one when nothing is saved or the store can't be read. */
export async function loadLandingChoice(): Promise<LandingChoice> {
  try {
    return cleanLandingChoice((await stateStore.get(PLATFORM_TENANT, KEY))?.state);
  } catch {
    return "quiet";
  }
}

export async function saveLandingChoice(page: LandingChoice, actor: string): Promise<LandingChoice> {
  await stateStore.put(PLATFORM_TENANT, KEY, { page, updatedAt: new Date().toISOString(), updatedBy: actor });
  return page;
}
