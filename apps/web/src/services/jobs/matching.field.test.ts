import { describe, expect, it } from "vitest";
import { computeMatch, fieldTerms } from "./matching";
import { extractSkills, inferSeniority, matchesQuery, titleMatches } from "./normalize";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { Job } from "@/domain/jobs/types";

/** An identity-and-access director — the real reported profile, with its generic lexicon skills. */
const dna: CareerDNA = {
  ...EMPTY_DNA,
  name: "A. Candidate",
  headline: "Target: Senior Director / SVP — IAM & AI Transformation | Digital Identity, Cyber Risk & AI Governance",
  careerGoal: "identity and access management",
  seniority: "director",
  yearsExperience: 21,
  industries: ["Technology", "Fintech"],
  preferredLocations: ["Mumbai"],
  skills: ["AI", "Strategy", "Roadmap", "Platform", "Onboarding", "Automation", "Security", "Compliance", "Risk", "Terraform"].map((name) => ({ name, level: 4 as const })),
};

const job = (over: Partial<Job>): Job => ({
  id: "j", sourceId: "s", externalId: "x", title: "", company: "Co", location: "Remote", country: "", workMode: "remote", currency: "USD", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(),
  description: "", requirements: [], niceToHave: [], skills: [], seniority: "mid", industry: "Technology", applyUrl: "https://x", applyPath: "platform", onEmployerSite: false, repostCount: 0, tags: [], ...over,
});

const query = "senior director svp iam";

describe("searching for the candidate's field", () => {
  it("reads the field from the headline and goal, leaving out level and industry words", () => {
    expect(fieldTerms(dna.headline, dna.careerGoal)).toEqual(["iam", "ai", "digital", "identity", "cyber", "risk", "governance", "access"]);
  });

  it("matches 'iam' as a whole word or its spelled-out form — not inside 'Williams'", () => {
    expect(titleMatches("Director of Identity and Access Management", query)).toBe(true);
    expect(titleMatches("Head of Identity, EMEA", query)).toBe(true);
    expect(titleMatches("IAM Engineer", query)).toBe(true);
    expect(titleMatches("Account Manager - Williams Sonoma", query)).toBe(false);
    expect(matchesQuery(job({ title: "Account Manager", tags: ["williams"], skills: ["AI"] }), query)).toBe(false);
    expect(matchesQuery(job({ title: "Security Architect", tags: ["identity management", "senior"], skills: ["SSO"] }), query)).toBe(true);
  });

  it("knows identity, security and governance skills, and SVP as a director-level title", () => {
    expect(extractSkills("Lead the IAM programme on Saviynt and SailPoint; CyberArk for privileged access management; SOX and ISO 27001 audits.")).toEqual(expect.arrayContaining(["IAM", "Saviynt", "SailPoint", "CyberArk", "Privileged Access Management", "SOX", "ISO 27001"]));
    expect(inferSeniority("SVP, Identity & Access Management")).toBe("director");
    expect(inferSeniority("Engineering Manager for IAM")).toBe("lead");
  });
});

describe("scoring against the candidate's field", () => {
  const pm = job({ title: "Senior Product Manager", seniority: "senior", skills: ["Strategy", "Roadmap", "Platform", "AI", "Onboarding", "Analytics"], description: "Own the roadmap for a platform used by millions. Drive strategy and onboarding with AI features." });
  const head = job({ title: "Head of Identity and Access Management", seniority: "director", skills: ["IAM", "SailPoint", "CyberArk", "Strategy", "Compliance", "Risk"], requirements: ["15+ years in identity and access management"], description: "Lead the IAM strategy, roadmap and platform across the bank; own risk and compliance." });
  const em = job({ title: "Engineering Manager for IAM", seniority: "lead", skills: ["IAM", "Okta", "Terraform", "Automation"], description: "Lead the identity platform team." });
  const warehouse = job({ title: "Warehouse Associate", seniority: "junior", skills: [], description: "Load and unload pallets." });

  it("a product-manager posting can't become worth considering on shared generic skills alone", () => {
    const m = computeMatch(pm, { dna });
    expect(m.score).toBeLessThanOrEqual(54);
    expect(m.fit).toBe("low_fit");
    expect(m.reasons.find((r) => r.dimension === "career_goal")?.summary).toMatch(/doesn't mention your field/);
  });

  it("a head-of-identity posting is a strong match, and an IAM engineering-manager posting is worth a look", () => {
    const h = computeMatch(head, { dna });
    expect(h.fit).toBe("strong");
    expect(h.reasons.find((r) => r.dimension === "career_goal")?.summary).toMatch(/in your field \(iam/);
    const e = computeMatch(em, { dna });
    expect(e.score).toBeGreaterThan(computeMatch(pm, { dna }).score + 15);
    expect(["strong", "worth_considering"]).toContain(e.fit);
  });

  it("ranks the field above everything else: identity roles first, then the product manager, then the warehouse", () => {
    const order = [pm, warehouse, em, head].map((j) => ({ t: j.title, s: computeMatch(j, { dna }).score })).sort((a, b) => b.s - a.s).map((x) => x.t);
    expect(order).toEqual(["Head of Identity and Access Management", "Engineering Manager for IAM", "Senior Product Manager", "Warehouse Associate"]);
  });

  it("a candidate whose skills are all generic still matches their own kind of role in full", () => {
    const pmDna: CareerDNA = { ...EMPTY_DNA, headline: "Product Manager · Consumer", careerGoal: "Lead product management", seniority: "senior", skills: [{ name: "Analytics", level: 5 }, { name: "Roadmapping", level: 5 }, { name: "Strategy", level: 4 }], industries: ["Technology"] };
    const m = computeMatch(pm, { dna: pmDna });
    expect(m.fit).toBe("strong");
  });
});

describe("the candidate's own search", () => {
  it("judges a posting on what was typed, not the profile's field — the reported case: 'psychology' for an IAM profile found nothing worth showing", () => {
    const psych = job({ title: "Clinical Psychologist", location: "Mumbai, India", workMode: "onsite", country: "IN", description: "Assessment and therapy for adults." });
    const typed = computeMatch(psych, { dna, searchQuery: "psychology" });
    const asProfile = computeMatch(psych, { dna });
    expect(typed.score).toBeGreaterThan(asProfile.score);
    expect(typed.reasons.find((r) => r.dimension === "career_goal")).toMatchObject({ label: "Search match" });
    expect(typed.fit).not.toBe("low_fit");
    // A posting that doesn't answer the search ranks below one that does.
    expect(computeMatch(job({ title: "Identity Engineer", location: "Mumbai", workMode: "onsite" }), { dna, searchQuery: "psychology" }).score).toBeLessThan(typed.score);
  });
});
