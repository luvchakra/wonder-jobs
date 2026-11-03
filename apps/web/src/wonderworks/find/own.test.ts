import { describe, expect, it } from "vitest";
import { postedOnWonderWorks } from "./own";

describe("WonderWorks only (2026-11-03)", () => {
  it("keeps what was posted on WonderWorks and leaves outside listings out", () => {
    expect(postedOnWonderWorks({ origin: "wonderstar" })).toBe(true);
    expect(postedOnWonderWorks({ origin: "wonderworks" })).toBe(true);
    expect(postedOnWonderWorks({ origin: "outside" })).toBe(false);
    expect(postedOnWonderWorks({ outside: { url: "https://x" } })).toBe(false); // events, marketplace
    expect(postedOnWonderWorks({ outside: undefined, id: "mk_1" })).toBe(true);
  });
});
