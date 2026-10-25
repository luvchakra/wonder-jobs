import { describe, expect, it } from "vitest";
import { scaleTop } from "./BarChart";

describe("the y axis", () => {
  it("tops out at the first round number at or above the highest bar", () => {
    expect(scaleTop(0)).toBe(2);
    expect(scaleTop(3)).toBe(3);
    expect(scaleTop(7)).toBe(8);
    expect(scaleTop(56)).toBe(60);
    expect(scaleTop(233)).toBe(250);
    expect(scaleTop(1843)).toBe(2000);
  });
});
