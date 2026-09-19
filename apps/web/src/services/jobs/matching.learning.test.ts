import { describe, expect, it } from "vitest";
import { computeMatch } from "./matching";
import { computeLearnedSignals, type RejectionRecord } from "@/domain/career/learning";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { CanonicalJob } from "@/domain/jobs/types";

/**
 * End-to-end check that a "not for me" pattern actually reaches `computeMatch` — the behavior change
 * that makes "Wonder will show fewer roles like this" (the toast copy) a true statement rather than an
 * aspirational one. Unit coverage of the signal computation itself lives in domain/career/learning.test.ts.
 */

const dna: CareerDNA = { ...EMPTY_DNA, seniority: "senior", industries: ["Fintech"], skills: [{ name: "Product Strategy", level: 5 }] };

function job(over: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id: "job-x",
    canonicalKey: "k",
    sourceIds: ["remotive"],
    duplicateOf: [],
    title: "Product Manager",
    company: "GameCo",
    location: "Remote",
    country: "IN",
    workMode: "remote",
    currency: "INR",
    postedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    description: "Product role.",
    requirements: [],
    niceToHave: [],
    skills: ["Product Strategy"],
    seniority: "senior",
    industry: "Gaming",
    applyUrl: "https://example.com",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: [],
    ...over,
  };
}

function gamingRejections(n: number): RejectionRecord[] {
  return Array.from({ length: n }, (_, i) => ({ jobId: `r${i}`, at: new Date().toISOString(), reason: "wrong_industry" as const, industry: "Gaming", workMode: "remote" as const }));
}

describe("computeMatch + learned signals (integration)", () => {
  it("scores identically with no rejection history — one rejection changes nothing", () => {
    const withoutSignals = computeMatch(job(), { dna });
    const oneRejection = computeMatch(job(), { dna, learnedSignals: computeLearnedSignals(gamingRejections(1)) });
    expect(oneRejection.score).toBe(withoutSignals.score);
  });

  it("scores lower once the same pattern has repeated enough to be a signal", () => {
    const baseline = computeMatch(job(), { dna });
    const learned = computeLearnedSignals(gamingRejections(4));
    const affected = computeMatch(job(), { dna, learnedSignals: learned });
    expect(affected.score).toBeLessThan(baseline.score);
    expect(affected.highlights).toContain("Similar to roles you've marked not for me");
  });

  it("never applies to a job outside the learned pattern", () => {
    const learned = computeLearnedSignals(gamingRejections(4));
    const fintechJob = computeMatch(job({ industry: "Fintech" }), { dna, learnedSignals: learned });
    expect(fintechJob.highlights).not.toContain("Similar to roles you've marked not for me");
  });

  it("the penalty is bounded — it can lower a fit label but never crashes the score below the floor", () => {
    const learned = computeLearnedSignals(gamingRejections(8));
    const affected = computeMatch(job(), { dna, learnedSignals: learned });
    expect(affected.score).toBeGreaterThanOrEqual(20);
  });
});
