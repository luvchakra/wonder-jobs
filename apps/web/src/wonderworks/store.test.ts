import { describe, expect, it } from "vitest";
import { compactModuleState, MODULE_CATALOG_CAP, MODULE_RECENT_CAP, MODULE_SAVED_CAP, moduleStore, STORED_DESCRIPTION, storedListing } from "./store";

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

describe("module catalog persistence", () => {
  const run = (ids: string[]) => ({ searched: { query: "design", places: [] }, sources: [{ id: "s", name: "S", state: "ok" as const, count: ids.length }], results: ids.map((id) => ({ id, description: "x".repeat(STORED_DESCRIPTION + 10) })) });

  it("keeps the last search, capped and with descriptions shortened", () => {
    const ids = Array.from({ length: MODULE_CATALOG_CAP + 5 }, (_, i) => `r${i}`);
    const out = compactModuleState({ saved: {}, responses: {}, recentSearches: [], lastRun: { ...run(ids), at: "2026-10-29T00:00:00Z" } });
    expect(out.lastRun?.results).toHaveLength(MODULE_CATALOG_CAP);
    expect((out.lastRun?.results[0] as unknown as { description: string }).description).toHaveLength(STORED_DESCRIPTION + 1);
    expect(out.lastRun?.searched.query).toBe("design");
    expect(out.lastRun?.sources[0].count).toBe(ids.length);
  });

  it("leaves a closed listing out of the results unless it's saved", () => {
    const s = moduleStore("events");
    s.getState().toggleSaved("kept");
    s.getState().markClosed("gone", "Closed on the employer's site");
    s.getState().markClosed("kept", "Closed on the employer's site");
    s.getState().setLastRun(run(["gone", "kept", "open"]));
    expect(s.getState().lastRun?.results.map((r) => r.id)).toEqual(["kept", "open"]);
    s.getState().markClosed("open", "Closed");
    expect(s.getState().lastRun?.results.map((r) => r.id)).toEqual(["kept"]);
    expect(Object.keys(compactModuleState(s.getState()).closed)).toEqual(["gone", "kept", "open"]);
  });

  it("keeps link checks only for listings it still shows or saved", () => {
    const out = compactModuleState({ saved: { a: "2026-10-29T00:00:00Z" }, responses: {}, recentSearches: [], lastRun: { ...run(["b"]), at: "" }, linkOpenAt: { a: "t", b: "t", c: "t" } });
    expect(Object.keys(out.linkOpenAt)).toEqual(["a", "b"]);
  });

  it("shortens only a long string description", () => {
    expect(storedListing({ id: "a", description: "short" })).toEqual({ id: "a", description: "short" });
    expect(storedListing(null)).toBeNull();
  });
});
