import { describe, expect, it } from "vitest";
import { hasProfile } from "./hasProfile";

describe("onboarding is skipped for an account that already has a profile (2026-11-03)", () => {
  it("knows a profile from onboarding done, a kept résumé or any profile field", () => {
    expect(hasProfile({ onboarded: true })).toBe(true);
    expect(hasProfile({ baseResume: { kind: "upload", id: "f1" } })).toBe(true);
    expect(hasProfile({ dna: { headline: "Data analyst", skills: [] } })).toBe(true);
    expect(hasProfile({ dna: { headline: "", skills: [{ name: "SQL" }] } })).toBe(true);
    expect(hasProfile({ dna: { headline: "", skills: [], history: { experience: [{}] } } })).toBe(true);
  });
  it("a new account, or nothing saved, has none", () => {
    expect(hasProfile(null)).toBe(false);
    expect(hasProfile({ onboarded: false, dna: { headline: " ", careerGoal: "", skills: [] } })).toBe(false);
  });
});
