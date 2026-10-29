import { describe, expect, it } from "vitest";
import { compactModuleState, MODULE_RECENT_CAP, MODULE_SAVED_CAP, moduleStore } from "./moduleStore";

describe("module-scoped stores", () => {
  it("one store per module, never shared with another module", () => {
    expect(moduleStore("internships")).toBe(moduleStore("internships"));
    expect(moduleStore("internships")).not.toBe(moduleStore("events"));
    moduleStore("internships").getState().toggleSaved("l1");
    expect(moduleStore("internships").getState().saved.l1).toBeTruthy();
    expect(moduleStore("events").getState().saved.l1).toBeUndefined();
  });

  it("persists only capped, newest-first state", () => {
    const saved = Object.fromEntries(Array.from({ length: MODULE_SAVED_CAP + 50 }, (_, i) => [`l${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()]));
    const out = compactModuleState({ saved, responses: {}, recentSearches: Array.from({ length: 20 }, (_, i) => `q${i}`) });
    expect(Object.keys(out.saved)).toHaveLength(MODULE_SAVED_CAP);
    expect(out.saved[`l${MODULE_SAVED_CAP + 49}`]).toBeTruthy();
    expect(out.saved.l0).toBeUndefined();
    expect(out.recentSearches).toHaveLength(MODULE_RECENT_CAP);
  });
});

describe("module search history", () => {
  it("keeps Find's and Saved's apart, and forgets one", () => {
    const s = moduleStore("internships");
    s.getState().rememberSearch("design");
    s.getState().rememberSearch("pune", "saved");
    expect(s.getState().recentSearches[0]).toBe("design");
    expect(s.getState().recentSavedSearches).toEqual(["pune"]);
    s.getState().forgetSearch("design");
    expect(s.getState().recentSearches).not.toContain("design");
    expect(s.getState().recentSavedSearches).toEqual(["pune"]);
    expect(compactModuleState({ ...s.getState(), recentSavedSearches: Array.from({ length: 20 }, (_, i) => `s${i}`) }).recentSavedSearches).toHaveLength(MODULE_RECENT_CAP);
  });
});
