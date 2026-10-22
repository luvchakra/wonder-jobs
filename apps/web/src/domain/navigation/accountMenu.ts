/**
 * The account menu (the avatar's menu, or the phone's ••• button): which items every user sees and in what
 * order, set once for the whole platform in WonderJobs Admin → Settings → Account menu (owner, 2026-10-22).
 * Account and Sign out are always there, so nobody is locked out of their own account; Admin is shown only
 * to platform admins, after the rest, and isn't part of this list. An item the list doesn't know yet (added
 * in a later release) takes its default place and is shown until an admin says otherwise.
 */
export const ACCOUNT_MENU_ITEMS = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan & billing" },
  { id: "connections", label: "Sign-in connections" },
  { id: "api_keys", label: "API keys" },
  { id: "notifications", label: "Notifications & email" },
  { id: "your_data", label: "Your data" },
  { id: "hiring", label: "Hiring" },
  { id: "analytics", label: "Analytics" },
  { id: "help", label: "Get Help" },
] as const;

export type AccountMenuItemId = (typeof ACCOUNT_MENU_ITEMS)[number]["id"];

/** Never hidden: the way to one's own account. */
export const ALWAYS_SHOWN: readonly AccountMenuItemId[] = ["account"];

export interface AccountMenuConfig {
  /** Every item, in the order users see them. */
  order: AccountMenuItemId[];
  /** Items no user sees. */
  hidden: AccountMenuItemId[];
  updatedAt?: string;
  updatedBy?: string;
}

const IDS = new Set<string>(ACCOUNT_MENU_ITEMS.map((i) => i.id));
const isId = (v: unknown): v is AccountMenuItemId => typeof v === "string" && IDS.has(v);

export const DEFAULT_ACCOUNT_MENU: AccountMenuConfig = { order: ACCOUNT_MENU_ITEMS.map((i) => i.id), hidden: [] };

/**
 * Read back or received from an admin: known ids only, each once; items missing from the order go back in at
 * their default place; Account can't be hidden.
 */
export function cleanAccountMenu(raw: unknown): AccountMenuConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const order: AccountMenuItemId[] = [];
  for (const v of Array.isArray(r.order) ? r.order : []) if (isId(v) && !order.includes(v)) order.push(v);
  // Missing ones: each right after the item it follows by default (or first).
  DEFAULT_ACCOUNT_MENU.order.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = DEFAULT_ACCOUNT_MENU.order.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const hidden = [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter(isId))].filter((id) => !ALWAYS_SHOWN.includes(id));
  return { order, hidden, ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}), ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}) };
}

/** A user's menu: the items they have (by mode), in the platform's order, without the hidden ones. */
export function arrangeAccountMenu<T extends { id: AccountMenuItemId }>(items: T[], config: AccountMenuConfig): T[] {
  const at = (id: AccountMenuItemId) => config.order.indexOf(id);
  return items.filter((i) => !config.hidden.includes(i.id)).sort((a, b) => at(a.id) - at(b.id));
}
