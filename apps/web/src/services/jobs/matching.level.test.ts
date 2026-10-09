import { describe, expect, it } from "vitest";
import { computeMatch } from "./matching";
import { inferSeniority, levelOfQuery } from "./normalize";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { Job } from "@/domain/jobs/types";

/** The owner's case: a senior director in identity and access management, searching for that level in Mumbai. */
const dna: CareerDNA = {
  ...EMPTY_DNA,
  headline: "Target: Senior Director / SVP — IAM & AI Transformation",
  careerGoal: "identity and access management",
  seniority: "director",
  preferredLocations: ["Mumbai"],
  skills: ["Identity", "IAM", "Security", "Governance", "Strategy"].map((name) => ({ name, level: 4 as const })),
};
const job = (title: string, hint?: string): Job => ({
  id: title, sourceId: "theirstack", externalId: "x", title, company: "Co", location: "Mumbai, India", country: "IN", workMode: "onsite", currency: "INR", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(),
  description: "Identity and access management, IAM governance and security.", requirements: [], niceToHave: [], skills: ["IAM", "Identity", "Security"], seniority: inferSeniority(title, hint), industry: "Technology", applyUrl: "https://x", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [],
});
const searchQuery = "senior director identity access";
const fitOf = (title: string, hint?: string) => computeMatch(job(title, hint), { dna, searchQuery });

describe("a role's level is read from its title", () => {
  it("trusts the title over the source's own label", () => {
    expect(inferSeniority("Analyst, Identity Access Management Administrator", "senior")).toBe("mid");
    expect(inferSeniority("Identity Security Consultant", "mid_level")).toBe("mid");
    expect(inferSeniority("IAM Program Lead", "junior")).toBe("lead");
    // Only a title that says nothing about level falls back to the source's label.
    expect(inferSeniority("Identity and Access Management", "c_level")).toBe("director");
  });
  it("reads the highest level named, and people managers as leads", () => {
    expect(inferSeniority("Associate Director, IAM")).toBe("director");
    expect(inferSeniority("Senior Associate")).toBe("senior");
    expect(inferSeniority("Manager - Enterprise Security (Identity & Access Management)")).toBe("lead");
    expect(inferSeniority("Product Manager")).toBe("mid");
    expect(inferSeniority("Identity and Access Management (MFA)- Vice President")).toBe("director");
  });
  it("reads the level a search asks for", () => {
    expect(levelOfQuery("senior director identity access")).toBe("director");
    expect(levelOfQuery("identity access")).toBeUndefined();
  });
});

describe("a senior director's search", () => {
  it("never calls a role two or more levels below a strong match", () => {
    for (const t of ["Analyst, Identity Access Management Administrator", "IAM Identity Security Engineer", "Identity Security Consultant"]) {
      const m = fitOf(t, "senior");
      expect(m.score, t).toBeLessThanOrEqual(64);
      expect(m.fit, t).not.toBe("strong");
    }
  });
  it("keeps a manager one level down to worth considering at most", () => {
    expect(fitOf("Manager - Enterprise Security (Identity & Access Management)").score).toBeLessThanOrEqual(79);
  });
  it("still finds director-level roles strong", () => {
    expect(fitOf("Senior Director, Identity and Access Management").fit).toBe("strong");
    expect(fitOf("Identity and Access Management - Vice President").fit).toBe("strong");
  });
  it("judges against the searched level, not only the profile's", () => {
    const m = computeMatch(job("Senior IAM Engineer"), { dna: { ...dna, seniority: "senior" }, searchQuery });
    expect(m.fit).not.toBe("strong");
    expect(m.reasons.find((r) => r.dimension === "seniority")?.summary).toBe("Below the level you searched for.");
  });
});
