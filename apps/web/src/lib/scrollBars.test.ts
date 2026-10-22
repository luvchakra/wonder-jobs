import { describe, expect, it } from "vitest";
import { offsets, settle, slide } from "./scrollBars";

const TOP = 64;
const BOTTOM = 64;

describe("the bars as the page scrolls", () => {
  it("hide slowly: the top bar first, then the bottom one", () => {
    let h = 0;
    h = slide(h, 40, 400, TOP, BOTTOM);
    expect(offsets(h, TOP, BOTTOM)).toEqual({ top: 20, bottom: 0 });
    h = slide(h, 120, 520, TOP, BOTTOM);
    expect(offsets(h, TOP, BOTTOM)).toEqual({ top: 64, bottom: 16 });
    h = slide(h, 1000, 1520, TOP, BOTTOM);
    expect(offsets(h, TOP, BOTTOM)).toEqual({ top: 64, bottom: 64 });
  });

  it("come back slowly when scrolling back: the bottom bar first, then the top", () => {
    let h = TOP + BOTTOM;
    h = slide(h, -80, 900, TOP, BOTTOM);
    expect(offsets(h, TOP, BOTTOM)).toEqual({ top: 64, bottom: 24 });
    h = slide(h, -200, 700, TOP, BOTTOM);
    expect(offsets(h, TOP, BOTTOM)).toEqual({ top: 0, bottom: 0 });
  });

  it("are always shown at the top of the page", () => {
    expect(slide(TOP + BOTTOM, 10, 30, TOP, BOTTOM)).toBe(0);
  });

  it("settle to the nearer end when scrolling stops halfway through a bar", () => {
    expect(settle(20, TOP, BOTTOM)).toBe(0);
    expect(settle(40, TOP, BOTTOM)).toBe(64);
    expect(settle(110, TOP, BOTTOM)).toBe(128);
  });
});
