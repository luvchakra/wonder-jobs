import { describe, expect, it } from "vitest";
import type { FilterResult } from "./filterExplain";
import { hiddenTag, preferencesHide, revealedIds, showHiddenLabel } from "./showHidden";

const result = (hiddenReason: FilterResult["hiddenReason"]): FilterResult => {
  const hiddenByReason: FilterResult["hiddenByReason"] = {};
  for (const r of Object.values(hiddenReason)) hiddenByReason[r] = (hiddenByReason[r] ?? 0) + 1;
  return { visibleIds: ["v"], hiddenByReason, hiddenTotal: Object.keys(hiddenReason).length, totalCatalog: Object.keys(hiddenReason).length + 1, hiddenReason };
};

describe("Show hidden", () => {
  it("names the one reason when every hidden job is for the other mode", () => {
    const r = result({ a: "other_mode", b: "other_mode" });
    expect(showHiddenLabel(r, "full_time")).toBe("Show 2 part-time");
    expect(showHiddenLabel(r, "part_time")).toBe("Show 2 full-time");
    expect(hiddenTag("other_mode", "full_time")).toBe("Part time");
    expect(preferencesHide(r)).toBe(false);
  });

  it("counts every hidden job but the ones marked not for me, and tags each with why", () => {
    const r = result({ a: "other_mode", b: "in_pipeline", c: "rejected", d: "min_fit" });
    expect(showHiddenLabel(r, "full_time")).toBe("Show 3 hidden");
    expect(revealedIds(r, (id) => ({ a: 50, b: 80, d: 70 })[id] ?? 0)).toEqual(["b", "d", "a"]);
    expect(hiddenTag("in_pipeline", "full_time")).toBe("Already in Pipeline");
    expect(hiddenTag("min_fit", "part_time")).toBe("Below your fit");
    expect(preferencesHide(r)).toBe(true);
  });

  it("offers nothing when only jobs marked not for me are hidden", () => {
    expect(showHiddenLabel(result({ c: "rejected" }), "full_time")).toBeNull();
  });
});
