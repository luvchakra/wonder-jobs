/**
 * The platform's UI choice (domain/platform/ui.ts), kept under the platform tenant in the state store like the
 * arranged menus. Only platform admins write it; everyone's pages read it. It holds no one's data.
 */
import { cleanUi, UI_DEFAULT, type UiConfig } from "@/domain/platform/ui";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

const KEY = "wj.look";

/** The choice in force; the first UI when none is saved or the store can't be read (the look never breaks). */
export async function loadUi(): Promise<UiConfig> {
  try {
    const doc = await stateStore.get(PLATFORM_TENANT, KEY);
    return cleanUi(doc?.state);
  } catch (e) {
    console.error(`[ui] choice unreadable, using the first UI: ${e instanceof Error ? e.message : "unknown"}`);
    return { version: UI_DEFAULT };
  }
}

export async function saveUi(raw: unknown, actor: string): Promise<UiConfig> {
  const value: UiConfig = { version: cleanUi(raw).version, updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, KEY, value);
  return value;
}
