import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_MENU, arrangeAccountMenu, cleanAccountMenu } from "./accountMenu";

const items = (ids: string[]) => ids.map((id) => ({ id })) as { id: (typeof DEFAULT_ACCOUNT_MENU.order)[number] }[];

describe("the platform's account menu", () => {
  it("starts as today's menu: every item, in its order, none hidden", () => {
    expect(cleanAccountMenu(undefined)).toEqual(DEFAULT_ACCOUNT_MENU);
    expect(DEFAULT_ACCOUNT_MENU.order).toEqual(["account", "plan", "connections", "api_keys", "notifications", "your_data", "hiring", "analytics", "help"]);
  });

  it("keeps an admin's order and hidden items, dropping unknown or repeated ones", () => {
    const c = cleanAccountMenu({ order: ["help", "account", "help", "nope", 3, "hiring", "plan", "connections", "api_keys", "notifications", "your_data", "analytics"], hidden: ["analytics", "nope", "analytics"] });
    expect(c.order).toEqual(["help", "account", "hiring", "plan", "connections", "api_keys", "notifications", "your_data", "analytics"]);
    expect(c.hidden).toEqual(["analytics"]);
  });

  it("puts an item the saved order doesn't know back at its default place, shown", () => {
    const c = cleanAccountMenu({ order: ["help", "account", "plan", "connections", "api_keys", "notifications", "your_data", "analytics"], hidden: [] });
    // Hiding nothing new; Hiring follows Your data, as it does by default.
    expect(c.order).toEqual(["help", "account", "plan", "connections", "api_keys", "notifications", "your_data", "hiring", "analytics"]);
  });

  it("never hides Account", () => {
    expect(cleanAccountMenu({ hidden: ["account", "hiring"] }).hidden).toEqual(["hiring"]);
  });

  it("arranges a user's own items by the platform's order, without the hidden ones", () => {
    const c = cleanAccountMenu({ order: ["help", "hiring", "account"], hidden: ["analytics"] });
    expect(arrangeAccountMenu(items(["account", "hiring", "analytics", "help"]), c).map((i) => i.id)).toEqual(["help", "hiring", "account"]);
  });
});
