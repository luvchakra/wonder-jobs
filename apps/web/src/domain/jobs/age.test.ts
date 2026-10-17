import { describe, expect, it } from "vitest";
import { MAX_POSTING_AGE_DAYS, postingTooOld } from "./age";

describe("postingTooOld", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("is true only past two weeks, and never for a date it can't read", () => {
    expect(MAX_POSTING_AGE_DAYS).toBe(14);
    expect(postingTooOld("2026-10-03T11:00:00Z", now)).toBe(true);
    expect(postingTooOld("2026-10-03T13:00:00Z", now)).toBe(false);
    expect(postingTooOld("not a date", now)).toBe(false);
    expect(postingTooOld(undefined, now)).toBe(false);
  });
});
