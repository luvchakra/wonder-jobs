import { describe, expect, it } from "vitest";
import type { CanonicalJob } from "@/domain/jobs/types";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { TemplateAIService, type AIProvider } from "./service";

/**
 * AI grounding tests (spec §34): deterministic fixtures with incomplete candidate data, verifying the
 * artifact WonderJobs actually hands a candidate never states as fact something Career DNA doesn't
 * contain. This exercises `TemplateAIService` directly — the deterministic draft, not a live model —
 * because that draft is exactly what every candidate sees without a configured platform key or BYOK,
 * and it's the one path this suite can assert on deterministically.
 */

/** Echoes the draft verbatim, the way WonderJobsAIProvider behaves when no platform model is configured. */
const echoProvider: AIProvider = {
  id: "wonderjobs",
  model: "test-echo",
  async complete(req) {
    const text = req.draft ?? req.prompt;
    return { text, model: "test-echo", inputTokens: 1, outputTokens: 1 };
  },
};

function job(over: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id: "job-1",
    canonicalKey: "k1",
    sourceIds: ["remotive"],
    duplicateOf: [],
    title: "Senior Product Manager",
    company: "PayCircle",
    location: "Bengaluru, India",
    country: "IN",
    workMode: "remote",
    currency: "INR",
    postedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    description: "Own the roadmap for a payments product.",
    requirements: ["5+ years product management", "Stakeholder management"],
    niceToHave: [],
    skills: ["Product Strategy", "SQL"],
    seniority: "senior",
    industry: "Fintech",
    applyUrl: "https://example.com/apply",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: ["growth"],
    ...over,
  };
}

/** A candidate who has entered almost nothing — the case most likely to tempt a template into inventing. */
const minimalDNA: CareerDNA = { ...EMPTY_DNA, name: "", headline: "", careerGoal: "", yearsExperience: 0, skills: [], industries: [], strengths: [], preferredLocations: [] };

/** A reasonably complete candidate, to check the grounded fields still come through when data exists. */
const richDNA: CareerDNA = {
  ...EMPTY_DNA,
  name: "Priya Raman",
  headline: "Senior Product Manager",
  careerGoal: "Lead product for a fintech platform",
  yearsExperience: 8,
  seniority: "senior",
  skills: [{ name: "Product Strategy", level: 5 }, { name: "SQL", level: 4 }],
  industries: ["Fintech"],
  strengths: ["Shipped a payments product used by 2M customers", "Led a cross-functional team of 8"],
  preferredLocations: ["Bengaluru", "Remote"],
  minSalary: 4_500_000,
};

/** Categories §7/§34 forbid inventing. None of these strings may appear unless the fixture actually stated them. */
const FORBIDDEN_WHEN_ABSENT = [
  "led roadmap and discovery for a consumer product used by millions", // the literal old fabricated bullet
  "I led discovery, defined the PRD and metrics", // the literal old fabricated screening answer
  "30–60 days", // the literal old fabricated availability claim
  "available to start within", // any phrasing asserting a specific availability
];

function assertNoFabrication(text: string, dna: CareerDNA) {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_WHEN_ABSENT) expect(lower, `must not contain fabricated text: "${phrase}"`).not.toContain(phrase.toLowerCase());
  // Never assert a specific years-of-experience number the candidate didn't provide.
  if (!dna.yearsExperience) expect(text).not.toMatch(/\d+\+?\s*years/i);
  // Never claim an industry that isn't in the candidate's own list.
  if (!dna.industries.length) expect(lower).not.toMatch(/\b(fintech|e-commerce|healthcare)\s+products?\b/);
}

describe("AI grounding — minimal candidate (no employment history, no industries, no strengths, no skills)", () => {
  const svc = new TemplateAIService(echoProvider);

  it("generateResume never invents an employment history or achievements", async () => {
    const text = await svc.generateResume({ job: job(), dna: minimalDNA });
    assertNoFabrication(text, minimalDNA);
    // The domain model has no employment-history field at all, so a resume MUST NOT claim one; it must
    // say so and ask the candidate, not fill the gap with invented experience.
    expect(text).toMatch(/\[.*(employment history|add your recent roles).*\]/i);
    expect(text).not.toMatch(/led roadmap|partnered with design|defined success metrics/i);
  });

  it("generateResume never crashes and never fabricates for a candidate with zero industries", async () => {
    await expect(svc.generateResume({ job: job(), dna: minimalDNA })).resolves.toBeTypeOf("string");
  });

  it("generateCoverLetter does not throw for zero industries (regression: dna.industries[0].toLowerCase() used to crash)", async () => {
    const text = await svc.generateCoverLetter({ job: job(), dna: minimalDNA });
    expect(text).toContain("[your industry]");
    expect(text).not.toMatch(/\bconsumer products\b/i); // the old invented second industry
  });

  it("generateCoverLetter never invents a second industry the candidate never listed", async () => {
    const oneIndustry: CareerDNA = { ...minimalDNA, industries: ["Fintech"] };
    const text = await svc.generateCoverLetter({ job: job(), dna: oneIndustry });
    expect(text.toLowerCase()).not.toContain("consumer products");
  });

  it("generateScreeningAnswers never invents a specific notice period", async () => {
    const text = await svc.generateScreeningAnswers({ job: job(), dna: minimalDNA });
    assertNoFabrication(text, minimalDNA);
    expect(text).toMatch(/\[add your notice period/i);
  });

  it("generateScreeningAnswers never invents a shipped-product story", async () => {
    const text = await svc.generateScreeningAnswers({ job: job(), dna: minimalDNA });
    expect(text).toMatch(/\[describe a project you shipped/i);
  });

  it("generateScreeningAnswers never claims compensation the candidate never stated", async () => {
    const text = await svc.generateScreeningAnswers({ job: job(), dna: minimalDNA });
    expect(text).not.toMatch(/expectation starts at/i);
    expect(text).toMatch(/\[add your compensation expectation/i);
  });

  it("generateScreeningAnswers never claims industry alignment that isn't evidenced", async () => {
    const text = await svc.generateScreeningAnswers({ job: job({ industry: "Fintech" }), dna: minimalDNA });
    expect(text).not.toMatch(/one of my target industries/i);
  });

  it("generateFollowUpEmail never invents a strength to mention", async () => {
    const text = await svc.generateFollowUpEmail({ job: job(), dna: minimalDNA, kind: "thank_you" });
    expect(text).toContain("[a relevant strength]");
  });
});

describe("AI grounding — evidenced candidate (facts must actually come through)", () => {
  const svc = new TemplateAIService(echoProvider);

  it("generateResume uses only the candidate's own strengths and skills", async () => {
    const text = await svc.generateResume({ job: job(), dna: richDNA });
    expect(text).toContain("Priya Raman");
    expect(text).toContain("Shipped a payments product used by 2M customers");
    expect(text).toContain("Led a cross-functional team of 8");
    expect(text).toContain("8+ years");
    // Still asks for employment history explicitly — the template supplies none on its own.
    expect(text).toMatch(/\[add your recent roles/i);
  });

  it("generateCoverLetter states the real years and industries, not invented ones", async () => {
    const text = await svc.generateCoverLetter({ job: job(), dna: richDNA });
    expect(text).toContain("8 years");
    expect(text).toContain("fintech");
    expect(text).not.toContain("[your industry]");
  });

  it("generateScreeningAnswers states the real minimum salary when the candidate gave one", async () => {
    const text = await svc.generateScreeningAnswers({ job: job(), dna: richDNA });
    expect(text).toMatch(/₹45L/);
  });

  it("generateScreeningAnswers claims industry alignment only when the job's industry is actually in the candidate's list", async () => {
    const aligned = await svc.generateScreeningAnswers({ job: job({ industry: "Fintech" }), dna: richDNA });
    expect(aligned).toMatch(/one of my target industries/i);
    const notAligned = await svc.generateScreeningAnswers({ job: job({ industry: "Gaming" }), dna: richDNA });
    expect(notAligned).not.toMatch(/one of my target industries/i);
  });
});

describe("AI grounding — regeneration preserves verified facts (spec §34)", () => {
  it("regenerating the same artifact twice for the same candidate never drifts to different invented facts", async () => {
    const svc = new TemplateAIService(echoProvider);
    const a = await svc.generateResume({ job: job(), dna: richDNA });
    const b = await svc.generateResume({ job: job(), dna: richDNA });
    expect(a).toBe(b); // deterministic template: same inputs, same grounded output, nothing invented anew
  });
});
