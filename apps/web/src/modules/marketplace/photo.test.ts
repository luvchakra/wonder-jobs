import { describe, expect, it } from "vitest";
import { fitSize, MAX_SIDE } from "./photo";

describe("fitSize", () => {
  it("shrinks a large photo to 1600 px on its long side, keeping its shape", () => {
    expect(fitSize(4000, 3000)).toEqual({ width: MAX_SIDE, height: 1200 });
    expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: MAX_SIDE });
  });
  it("never enlarges a small one", () => expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 }));
});
