import { describe, expect, it, vi } from "vitest";
import { bestIds, lastEntries, memoOnInputs, pick, readHistory, recentEntries, remembered, shortened, trimAside } from "./catalog";

describe("WonderWorks persisted-catalog helpers", () => {
  it("shortens long text with an ellipsis and leaves short text alone", () => {
    expect(shortened("abc", 5)).toBe("abc");
    expect(shortened("abcde fgh", 6)).toBe("abcde…");
  });

  it("keeps every kept id, then the best by score up to the cap", () => {
    const score: Record<string, number> = { a: 1, b: 9, c: 5, d: 7 };
    expect([...bestIds(["a", "b", "c", "d"], (id) => score[id], 3, ["s"])]).toEqual(["s", "b", "d"]);
    expect([...bestIds(["a", "b"], (id) => score[id], 1, ["s", "t"])]).toEqual(["s", "t"]);
  });

  it("picks entries in the ids' order, skipping missing ones", () => {
    expect(pick({ a: 1, b: 2 }, ["b", "x", "a"], (v) => v * 10)).toEqual({ b: 20, a: 10 });
  });

  it("trims a set-aside list to its best items, in their own order", () => {
    const out = trimAside({ order: ["a", "b", "c"], items: { a: "A", b: "B", c: "C" } }, (id) => ({ a: 1, b: 3, c: 2 })[id] ?? 0, 2, (v) => v.toLowerCase());
    expect(out).toEqual({ order: ["b", "c"], items: { b: "b", c: "c" }, ids: ["b", "c"] });
    expect(trimAside({ order: ["x"], items: {} }, () => 0, 2)).toBeUndefined();
    expect(trimAside(undefined, () => 0, 2)).toBeUndefined();
  });

  it("caps records to their last entries, and to recent ones", () => {
    expect(lastEntries({ a: 1, b: 2, c: 3 }, 2)).toEqual({ b: 2, c: 3 });
    expect(lastEntries({ a: 1, b: 2, c: 3 }, 5, (id) => id !== "b")).toEqual({ a: 1, c: 3 });
    const now = Date.parse("2026-10-29T00:00:00Z");
    const rec = { old: { at: "2026-10-01T00:00:00Z" }, new: { at: "2026-10-28T00:00:00Z" } };
    expect(recentEntries(rec, (v) => v.at, 7, 10, now)).toEqual({ new: rec.new });
  });

  it("moves a search to the front once, whatever its case, and ignores blanks", () => {
    const list = ["design", "Pune"];
    expect(remembered(list, "  pune  ", 5)).toEqual(["pune", "design"]);
    expect(remembered(list, "   ", 5)).toBe(list);
    expect(remembered(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    expect(readHistory(["a", 1, "b", "c"], 2)).toEqual(["a", "b"]);
    expect(readHistory("x", 2)).toEqual([]);
  });

  it("rebuilds only when an input changed", () => {
    const build = vi.fn((a: object, b: number) => ({ a, b }));
    const memo = memoOnInputs(build);
    const a = {};
    expect(memo(a, 1)).toBe(memo(a, 1));
    memo({}, 1);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
