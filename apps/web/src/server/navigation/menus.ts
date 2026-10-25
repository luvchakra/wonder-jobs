/**
 * The menus a platform admin arranges (domain/navigation/menus.ts), each kept under the platform tenant in the
 * state store like the scheduler's settings. Only platform admins write them; every user's menus read them.
 * They hold no one's data.
 */
import { MENU_IDS, cleanMenu, defaultMenu, type MenuConfig, type MenuId } from "@/domain/navigation/menus";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

const KEY = { account: "wj.accountmenu", you: "wj.youmenu", find_kinds: "wj.findkindsmenu" } as const satisfies Record<MenuId, string>;

/** A menu in force; today's default when none is saved or the store can't be read (menus keep working). */
export async function loadMenu<M extends MenuId>(menu: M): Promise<MenuConfig<M>> {
  try {
    const doc = await stateStore.get(PLATFORM_TENANT, KEY[menu]);
    return cleanMenu(menu, doc?.state);
  } catch (e) {
    console.error(`[menus] ${menu} unreadable, using the default: ${e instanceof Error ? e.message : "unknown"}`);
    return defaultMenu(menu);
  }
}

export async function loadMenus(): Promise<{ [M in MenuId]: MenuConfig<M> }> {
  const all = await Promise.all(MENU_IDS.map(async (m) => [m, await loadMenu(m)] as const));
  return Object.fromEntries(all) as { [M in MenuId]: MenuConfig<M> };
}

export async function saveMenu<M extends MenuId>(menu: M, raw: unknown, actor: string): Promise<MenuConfig<M>> {
  const value: MenuConfig<M> = { ...cleanMenu(menu, raw), updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, KEY[menu], value);
  return value;
}
