import { describe, expect, it } from "vitest";
import { legacyTestEmail } from "./auth";

describe("legacy test email (local E2E only)", () => {
  it("is ignored unless the Playwright flag is set", () => {
    expect(legacyTestEmail("wj-e2e-owner-1@example.com", {})).toEqual({});
    expect(legacyTestEmail("wj-e2e-owner-1@example.com", { WJ_E2E_LEGACY_EMAIL: "0" })).toEqual({});
  });

  it("accepts only disposable wj-e2e addresses, never a real one", () => {
    const on = { WJ_E2E_LEGACY_EMAIL: "1" };
    expect(legacyTestEmail("wj-e2e-owner-1@example.com", on)).toEqual({ email: "wj-e2e-owner-1@example.com" });
    expect(legacyTestEmail(encodeURIComponent("WJ-E2E-a@EXAMPLE.com"), on)).toEqual({ email: "wj-e2e-a@example.com" });
    for (const real of ["owner@wonderhome.com", "wj-e2e-x@gmail.com", "x@example.com", ""]) expect(legacyTestEmail(real, on)).toEqual({});
  });
});
