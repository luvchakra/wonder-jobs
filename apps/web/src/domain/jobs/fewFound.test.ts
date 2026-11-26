import { describe, expect, it } from "vitest";
import { fewFound, fewLine } from "./fewFound";
import type { JobMatch } from "./types";

const fits: Record<string, JobMatch["fit"]> = { a: "strong", b: "worth_considering", c: "low_fit", d: "low_fit", e: "stretch" };
const fitOf = (id: string) => fits[id];

describe("few jobs that fit a role's or typed search", () => {
  it("keeps the jobs above a low fit and folds the low fits when fewer than five fit", () => {
    expect(fewFound(["a", "c", "b", "d", "e"], fitOf)).toEqual({ kept: ["a", "b", "e"], folded: 2 });
  });
  it("leaves the list alone with five or more that fit, or with no low fits", () => {
    expect(fewFound(["a", "b", "e", "x1", "x2", "c"], (id) => (id.startsWith("x") ? "strong" : fits[id]))).toBeNull();
    expect(fewFound(["a", "b"], fitOf)).toBeNull();
  });
  it("says the real counts", () => {
    expect(fewLine("insurance operations", 3, 11)).toBe("Only 3 jobs fit “insurance operations” in your sources right now · searched 11 sources");
    expect(fewLine("insurance operations", 1, 11)).toBe("Only 1 job fits “insurance operations” in your sources right now · searched 11 sources");
    expect(fewLine("insurance operations", 0, 1)).toBe("No jobs fit “insurance operations” well in your sources right now · searched 1 source");
  });
});
