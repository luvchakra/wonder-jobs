/**
 * Menus a platform admin arranges for every user (owner, 2026-10-22), in WonderJobs Admin → Settings → Menus:
 * - the account menu (the avatar's menu, or the phone's ••• button) — Account and Sign out are always there,
 *   so nobody is locked out of their own account; Admin is shown only to platform admins, last, outside the list;
 * - the You page's rows (under the Career Profile card, which is always there).
 * Each keeps an order and a set of hidden items. An item a saved order doesn't know (added in a later release)
 * takes its default place and is shown until an admin says otherwise.
 */
export const MENUS = {
  account: {
    title: "Account menu",
    where: "The avatar's menu, or the ••• button on a phone. Account and Sign out are always there; Admin shows only to admins, last.",
    items: [
      { id: "account", label: "Account" },
      { id: "plan", label: "Plan & billing" },
      { id: "api_keys", label: "API keys" },
      { id: "notifications", label: "Notifications & email" },
      { id: "your_data", label: "Your data" },
      { id: "hiring", label: "Hiring" },
      { id: "analytics", label: "Analytics" },
      { id: "help", label: "Get Help" },
    ],
    alwaysShown: ["account"],
  },
  you: {
    title: "You page",
    where: "The rows under the Career Profile card on You. The Career Profile card is always there.",
    items: [
      { id: "ask_wonder", label: "Ask Wonder" },
      { id: "skill_up", label: "Skill Up" },
      { id: "recruiters", label: "Recruiters" },
      { id: "resumes", label: "Résumés" },
      { id: "job_sources", label: "Job sources" },
      { id: "automation", label: "Automation" },
      { id: "ai_provider", label: "AI provider" },
      { id: "search_history", label: "Search history" },
    ],
    alwaysShown: [],
  },
} as const satisfies Record<string, { title: string; where: string; items: readonly { id: string; label: string }[]; alwaysShown: readonly string[] }>;

export type MenuId = keyof typeof MENUS;
export const MENU_IDS = Object.keys(MENUS) as MenuId[];
export type MenuItemId<M extends MenuId> = (typeof MENUS)[M]["items"][number]["id"];

export interface MenuConfig<M extends MenuId = MenuId> {
  /** Every item, in the order users see them. */
  order: MenuItemId<M>[];
  /** Items no user sees. */
  hidden: MenuItemId<M>[];
  updatedAt?: string;
  updatedBy?: string;
}

export const isMenuId = (v: unknown): v is MenuId => typeof v === "string" && Object.hasOwn(MENUS, v);

export function defaultMenu<M extends MenuId>(menu: M): MenuConfig<M> {
  return { order: MENUS[menu].items.map((i) => i.id) as MenuItemId<M>[], hidden: [] };
}

/**
 * Read back or received from an admin: known ids only, each once; items missing from the order go back in at
 * their default place; an always-shown item can't be hidden.
 */
export function cleanMenu<M extends MenuId>(menu: M, raw: unknown): MenuConfig<M> {
  const ids = defaultMenu(menu).order as string[];
  const always = MENUS[menu].alwaysShown as readonly string[];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const order: string[] = [];
  for (const v of Array.isArray(r.order) ? r.order : []) if (typeof v === "string" && ids.includes(v) && !order.includes(v)) order.push(v);
  // Missing ones: each right after the item it follows by default (or first).
  ids.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = ids.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const hidden = [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter((v): v is string => typeof v === "string" && ids.includes(v)))].filter((id) => !always.includes(id));
  return { order: order as MenuItemId<M>[], hidden: hidden as MenuItemId<M>[], ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}), ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}) };
}

/** A user's menu: the items they have, in the platform's order, without the hidden ones. */
export function arrangeMenu<T extends { id: string }>(items: T[], config: { order: readonly string[]; hidden: readonly string[] }): T[] {
  const at = (id: string) => config.order.indexOf(id);
  return items.filter((i) => !config.hidden.includes(i.id)).sort((a, b) => at(a.id) - at(b.id));
}
