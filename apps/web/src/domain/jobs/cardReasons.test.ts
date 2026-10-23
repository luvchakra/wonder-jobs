import { describe, expect, it } from "vitest";
import { cardReasons } from "./cardReasons";
import type { AlignmentReason } from "./types";

const r = (dimension: AlignmentReason["dimension"], score: number, summary = "", label = ""): AlignmentReason => ({ dimension, score, summary, label });

describe("cardReasons", () => {
  it("says only what scored well, strongest first, at most three", () => {
    const reasons = [r("skills", 0.9, "8 of your skills appear in this posting (iam, sso, okta)."), r("seniority", 1), r("industry", 0.55), r("location", 1), r("career_goal", 0.85, "", "Career-goal alignment")];
    expect(cardReasons({ workMode: "remote", salaryMax: undefined }, { reasons })).toEqual(["Your level", "Remote friendly", "Matches 8 of your skills"]);
  });

  it("says nothing without a match, or when nothing scored well", () => {
    expect(cardReasons({ workMode: "onsite", salaryMax: undefined }, undefined)).toEqual([]);
    expect(cardReasons({ workMode: "onsite", salaryMax: undefined }, { reasons: [r("skills", 0.4, "Few of your skills appear in this posting."), r("location", 0.3)] })).toEqual([]);
  });

  it("never counts undisclosed pay, or a skills line without a count", () => {
    const reasons = [r("compensation", 0.9), r("skills", 0.9, "Few of your skills appear in this posting.")];
    expect(cardReasons({ workMode: "onsite", salaryMax: undefined }, { reasons })).toEqual([]);
    expect(cardReasons({ workMode: "onsite", salaryMax: 3_000_000 }, { reasons })).toEqual(["Pay meets your minimum"]);
  });

  it("names a typed search's match as such", () => {
    expect(cardReasons({ workMode: "hybrid", salaryMax: undefined }, { reasons: [r("career_goal", 1, "", "Search match"), r("location", 0.9)] })).toEqual(["Title matches your search", "In your preferred location"]);
  });
});
