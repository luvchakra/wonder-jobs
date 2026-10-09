import { describe, expect, it } from "vitest";
import { ageLabel, cacheState, mergeDelta, EMPTY_FRESH_MS, FRESH_MS, pickEntry, placeTokens, queryTokens, searchKey, servingDepths, STALE_MS } from "./cache";

describe("searchKey — the same question, however it's worded", () => {
  it("ignores case, order, punctuation, filler words and plural endings", () => {
    const a = searchKey({ query: "Senior Director, Identity and Access Management", locations: ["Mumbai, Maharashtra"] });
    expect(searchKey({ query: "senior director identity access management", locations: ["Mumbai"] })).toBe(a);
    expect(searchKey({ query: "Identity & Access Management Senior Director jobs", locations: ["bombay"] })).toBe(a);
    expect(queryTokens("Data Engineers")).toEqual(["data", "engineer"]);
    expect(queryTokens("access analysis status")).toEqual(["access", "analysis", "status"]); // not "acces"/"analysi"/"statu"
    expect(queryTokens("C++ and C# developer")).toEqual(["c#", "c++", "developer"]);
  });

  it("different words or places are different searches", () => {
    const base = searchKey({ query: "identity security", locations: ["Bengaluru"] });
    expect(searchKey({ query: "identity security", locations: ["Bangalore"] })).toBe(base);
    expect(searchKey({ query: "identity security", locations: ["Pune"] })).not.toBe(base);
    expect(searchKey({ query: "identity security", locations: [] })).not.toBe(base);
    expect(searchKey({ query: "identity governance", locations: ["Bengaluru"] })).not.toBe(base);
    expect(placeTokens(["Gurgaon", "Gurugram, Haryana", "New Delhi"])).toEqual(["delhi", "gurugram"]);
  });
});

describe("cacheState — how long an answer is good for", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  it("fresh, then stale (fallback only), then expired; empty answers go stale sooner", () => {
    expect(cacheState({ fetchedAt: at(FRESH_MS - 1000), retrieved: 5 }, now)).toBe("fresh");
    expect(cacheState({ fetchedAt: at(FRESH_MS + 1000), retrieved: 5 }, now)).toBe("stale");
    expect(cacheState({ fetchedAt: at(EMPTY_FRESH_MS + 1000), retrieved: 0 }, now)).toBe("stale");
    expect(cacheState({ fetchedAt: at(STALE_MS + 1000), retrieved: 5 }, now)).toBe("expired");
    expect(cacheState({ fetchedAt: "not a date", retrieved: 5 }, now)).toBe("expired");
    expect(cacheState({ fetchedAt: new Date(now + 60_000).toISOString(), retrieved: 5 }, now)).toBe("expired");
  });
  it("picks the newest usable answer, and stale ones only when allowed", () => {
    const old = { fetchedAt: at(FRESH_MS + 1000), retrieved: 3 };
    const recent = { fetchedAt: at(60_000), retrieved: 3 };
    expect(pickEntry([old, recent], now, false)).toBe(recent);
    expect(pickEntry([old], now, false)).toBeUndefined();
    expect(pickEntry([old], now, true)).toBe(old);
    expect(ageLabel(at(12 * 60_000), now)).toBe("12 min");
    expect(ageLabel(at(3 * 3_600_000), now)).toBe("3 h");
  });
  it("a deeper fetch can answer a shallower request, not the other way round", () => {
    expect(servingDepths("shallow")).toEqual(["shallow", "normal", "deep"]);
    expect(servingDepths("deep")).toEqual(["deep"]);
  });
});

describe("mergeDelta — a repeat search's new jobs on top of the earlier answer", () => {
  it("puts the new jobs first, keeps each job once and stops at the source's limit", () => {
    const j = (id: string) => ({ id });
    expect(mergeDelta([j("c"), j("a")], [j("a"), j("b")], 10).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(mergeDelta([j("c")], [j("a"), j("b")], 2).map((x) => x.id)).toEqual(["c", "a"]);
    expect(mergeDelta([], [j("a")], 5).map((x) => x.id)).toEqual(["a"]);
  });
});
