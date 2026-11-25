import { describe, expect, it } from "vitest";
import { foundSoFar } from "./JobsReadiness";

describe("the running search's banner", () => {
  it("says how many postings it checked so far, and in how many sources", () => {
    expect(foundSoFar(126, 9)).toBe("126 postings checked in 9 sources");
    expect(foundSoFar(1, 1)).toBe("1 posting checked in 1 source");
    expect(foundSoFar(12400, 3)).toBe("12,400 postings checked in 3 sources");
  });
});
