import { describe, expect, it } from "vitest";
import { computeMatch } from "./matching";
import { roleKey, roleScope, scopeForJob, searchWordsOf } from "./roleScope";
import { profileForAi, profileKey } from "@/domain/jobs/aiFit";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { Job } from "@/domain/jobs/types";

// The owner's case (2026-11-25): an IAM director searching as their "Reinsurance" role.
const dna: CareerDNA = {
  ...EMPTY_DNA,
  headline: "Target: Senior Director / SVP — IAM & AI Transformation",
  careerGoal: "director",
  seniority: "director",
  industries: ["Technology", "Fintech"],
  preferredLocations: [],
  skills: ["AI", "Strategy", "Roadmap", "Platform", "Onboarding", "Automation", "Security", "Compliance", "Risk"].map((name) => ({ name, level: 4 as const })),
};
const reinsurance = { id: "r1", title: "Reinsurance", query: "Insurance operations", goal: "Senior management", createdAt: "", updatedAt: "" };

const job = (over: Partial<Job>): Job => ({
  id: "j", sourceId: "s", externalId: "x", title: "", company: "Co", location: "Remote", country: "", workMode: "remote", currency: "USD", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(),
  description: "", requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: "https://x", applyPath: "platform", onEmployerSite: false, repostCount: 0, tags: [], ...over,
});
const engineering = job({ id: "eng", title: "Director of Engineering, KYX", description: "Own the identity verification platform roadmap and onboarding; lead AI automation, security and compliance.", tags: ["Roadmap", "Onboarding", "Platform"], skills: ["AI", "Platform", "Security"] });
const insurance = job({ id: "ins", title: "Head of Reinsurance Operations", industry: "Insurance", description: "Lead insurance operations for the reinsurance treaty portfolio: claims, underwriting support and risk strategy." });

describe("scoring a role's search", () => {
  it("before: the profile's search ranked the IAM engineering job over the insurance one", () => {
    const ctx = { dna, careerGoal: reinsurance.goal };
    expect(computeMatch(engineering, ctx).score).toBeGreaterThan(computeMatch(insurance, ctx).score);
  });

  it("after: judged on the role's words and goal, insurance leads and the engineering job is a low fit", () => {
    const r = roleScope(reinsurance);
    const ctx = { dna, searchQuery: r.query, careerGoal: r.careerGoal, forRole: true };
    const ins = computeMatch(insurance, ctx);
    const eng = computeMatch(engineering, ctx);
    expect(ins.score).toBeGreaterThan(eng.score);
    expect(eng.fit === "low_fit" || eng.fit === "stretch").toBe(true);
    // A role has no industries: the profile's aren't claimed as "your target industry".
    expect(eng.reasons.find((x) => x.dimension === "industry")?.summary).toBe("Not weighed when searching as a role.");
  });

  it("finds the role a job was found as, and judges a role's run on its words", () => {
    expect(scopeForJob({ foundAs: { id: "r1" } }, [reinsurance])).toEqual({ title: "Reinsurance", query: "Insurance operations", careerGoal: "Senior management" });
    expect(scopeForJob({ foundAs: { id: "gone" } }, [reinsurance])).toBeUndefined();
    expect(scopeForJob({}, [reinsurance])).toBeUndefined();
    expect(searchWordsOf({ origin: "words", searchCriteria: { query: "Insurance operations" } })).toBe("Insurance operations");
    expect(searchWordsOf({ origin: "profile", searchCriteria: { query: "director" } })).toBeUndefined();
  });

  it("tells the AI read the role, and keys its read to the role", () => {
    const r = roleScope(reinsurance);
    expect(profileForAi(dna, r).roleWanted).toBe("Reinsurance: Insurance operations — Senior management");
    expect(profileForAi(dna).roleWanted).toBe("director");
    expect(profileKey(dna, roleKey(r))).not.toBe(profileKey(dna));
    expect(profileKey(dna, "")).toBe(profileKey(dna));
  });
});
