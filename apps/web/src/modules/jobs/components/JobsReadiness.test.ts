import { describe, expect, it } from "vitest";
import { foundSoFar } from "./JobsReadiness";

describe("the running search's banner", () => {
  it("says how many it found so far and in how many sources", () => {
    expect(foundSoFar(126, 9)).toBe("126 found so far in 9 sources");
    expect(foundSoFar(1, 1)).toBe("1 found so far in 1 source");
    expect(foundSoFar(12400, 3)).toBe("12,400 found so far in 3 sources");
  });
});
