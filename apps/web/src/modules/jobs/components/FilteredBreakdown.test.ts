import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilteredBreakdown, CLEAR_FILTERS_PATCH } from "./FilteredBreakdown";
import type { FilterResult } from "@/domain/jobs/filterExplain";

const result = (hiddenByReason: FilterResult["hiddenByReason"]): FilterResult => {
  const hiddenTotal = Object.values(hiddenByReason).reduce((n, v) => n + (v ?? 0), 0);
  return { visibleIds: ["a"], hiddenByReason, hiddenTotal, totalCatalog: hiddenTotal + 1 } as FilterResult;
};
const html = (r: FilterResult) => renderToStaticMarkup(createElement(FilteredBreakdown, { result: r, onShowAnyway: () => {} }));

describe("Show me anyway", () => {
  it("isn't offered when nothing it clears is hiding jobs (the other mode's jobs, jobs marked not for me)", () => {
    expect(html(result({ other_mode: 16 }))).not.toContain("Show me anyway");
    expect(html(result({ rejected: 2, other_mode: 3 }))).not.toContain("Show me anyway");
  });

  it("is offered when a filter it clears hides jobs", () => {
    expect(html(result({ other_mode: 16, too_old: 4 }))).toContain("Show me anyway");
    expect(html(result({ work_mode: 1 }))).toContain("Show me anyway");
  });

  it("brings back jobs hidden as too old, too", () => {
    expect(CLEAR_FILTERS_PATCH.includeOld).toBe(true);
  });
});
