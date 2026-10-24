import { describe, expect, it } from "vitest";
import { arrangeMenu, cleanMenu, defaultMenu, isMenuId } from "./menus";

describe("menus a platform admin arranges", () => {
  it("start as today's menus: every item, in its order, none hidden", () => {
    expect(cleanMenu("account", undefined)).toEqual(defaultMenu("account"));
    expect(defaultMenu("account").order).toEqual(["account", "ai_provider", "api_keys", "notifications", "automation", "analytics", "help"]);
    expect(defaultMenu("you").order).toEqual(["ask_wonder", "skill_up", "recruiters", "resumes", "job_sources", "hiring", "search_history"]);
    expect([isMenuId("you"), isMenuId("toString"), isMenuId("nope")]).toEqual([true, false, false]);
  });

  it("keep an admin's order and hidden items, dropping unknown or repeated ones, and only that menu's items", () => {
    const c = cleanMenu("you", { order: ["search_history", "skill_up", "search_history", "help", 3, "recruiters", "resumes", "job_sources", "hiring", "ai_provider"], hidden: ["hiring", "account", "hiring"] });
    expect(c.order).toEqual(["ask_wonder", "search_history", "skill_up", "recruiters", "resumes", "job_sources", "hiring"]);
    expect(c.hidden).toEqual(["hiring"]);
  });

  it("put an item the saved order doesn't know back at its default place, shown", () => {
    const c = cleanMenu("account", { order: ["help", "account", "plan", "api_keys", "notifications", "your_data", "analytics"], hidden: [] });
    expect(c.order).toEqual(["help", "account", "ai_provider", "api_keys", "notifications", "automation", "analytics"]);
  });

  it("never hide Account in the account menu; every You row can be hidden", () => {
    expect(cleanMenu("account", { hidden: ["account", "automation"] }).hidden).toEqual(["automation"]);
    expect(cleanMenu("you", { hidden: defaultMenu("you").order }).hidden).toHaveLength(7);
  });

  it("arrange a user's own items by the platform's order, without the hidden ones", () => {
    const c = cleanMenu("account", { order: ["help", "automation", "account"], hidden: ["analytics"] });
    expect(arrangeMenu(["account", "automation", "analytics", "help"].map((id) => ({ id })), c).map((i) => i.id)).toEqual(["help", "automation", "account"]);
  });
});
