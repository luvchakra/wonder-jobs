/**
 * The platform's account menu (order and hidden items), kept under the platform tenant in the state store like
 * the scheduler's settings. Only platform admins write it; every user's menu reads it. It holds no one's data.
 */
import { DEFAULT_ACCOUNT_MENU, cleanAccountMenu, type AccountMenuConfig } from "@/domain/navigation/accountMenu";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

const KEY = "wj.accountmenu";

/** The menu in force; today's default when none is saved or the store can't be read (menus keep working). */
export async function loadAccountMenu(): Promise<AccountMenuConfig> {
  try {
    const doc = await stateStore.get(PLATFORM_TENANT, KEY);
    return cleanAccountMenu(doc?.state);
  } catch (e) {
    console.error(`[account-menu] unreadable, using the default: ${e instanceof Error ? e.message : "unknown"}`);
    return DEFAULT_ACCOUNT_MENU;
  }
}

export async function saveAccountMenu(raw: unknown, actor: string): Promise<AccountMenuConfig> {
  const value: AccountMenuConfig = { ...cleanAccountMenu(raw), updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, KEY, value);
  return value;
}
