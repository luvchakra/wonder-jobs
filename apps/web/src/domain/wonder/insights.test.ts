import { describe, expect, it } from "vitest";
import { computeMissingSkills, findJobBySubject } from "./insights";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { CareerDNA } from "@/domain/career/types";

const NOW = Date.now();

function job(id: string, over: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id,
    canonicalKey: id,
    sourceIds: ["remotive"],
    duplicateOf: [],
    title: "Product Manager",
    company: "Co",
    location: "Bengaluru",
    country: "IN",
    workMode: "remote",
    currency: "INR",
    postedAt: new Date(NOW).toISOString(),
    observedAt: new Date(NOW).toISOString(),
    description: "",
    requirements: [],
    niceToHave: [],
    skills: [],
    seniority: "senior",
    industry: "Fintech",
    applyUrl: "https://example.com",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: [],
    ...over,
  };
}
function match(id: string, fit: JobMatch["fit"]): JobMatch {
  return { jobId: id, score: 80, fit, reasons: [], highlights: [], computedAt: new Date().toISOString() };
}
function dna(skills: string[]): Pick<CareerDNA, "skills"> {
  return { skills: skills.map((name) => ({ name, level: 3 as const })) };
}

describe("computeMissingSkills — real skill gaps from the candidate's own matches, never a canned list", () => {
  it("returns nothing when there are no jobs", () => {
    expect(computeMissingSkills(dna([]), [], {})).toEqual([]);
  });

  it("ignores skills the candidate already has", () => {
    const jobs = [job("a", { skills: ["SQL", "Python"] })];
    const matches = { a: match("a", "strong") };
    expect(computeMissingSkills(dna(["SQL", "Python"]), jobs, matches)).toEqual([]);
  });

  it("counts a skill once per job that asks for it, across strong and worth-considering matches only", () => {
    const jobs = [job("a", { skills: ["SQL"] }), job("b", { skills: ["SQL", "Python"] }), job("c", { skills: ["SQL"] })];
    const matches = { a: match("a", "strong"), b: match("b", "worth_considering"), c: match("c", "stretch") };
    const r = computeMissingSkills(dna([]), jobs, matches);
    expect(r.find((s) => s.name === "SQL")?.count).toBe(2); // c is "stretch" and excluded
    expect(r.find((s) => s.name === "Python")?.count).toBe(1);
  });

  it("sorts by frequency, then name, and respects the limit", () => {
    const jobs = [job("a", { skills: ["Go"] }), job("b", { skills: ["Go", "Rust"] }), job("c", { skills: ["Rust"] }), job("d", { skills: ["Kotlin"] })];
    const matches = { a: match("a", "strong"), b: match("b", "strong"), c: match("c", "strong"), d: match("d", "strong") };
    const r = computeMissingSkills(dna([]), jobs, matches, 2);
    expect(r).toEqual([
      { name: "Go", count: 2 },
      { name: "Rust", count: 2 },
    ]);
  });
});

describe("findJobBySubject — real catalog lookup, no fuzzy AI matching", () => {
  it("finds by a title substring, case-insensitively", () => {
    const jobs = { a: job("a", { title: "Senior Product Manager" }) };
    expect(findJobBySubject(["a"], jobs, "product manager")?.id).toBe("a");
  });

  it("finds by a company substring either direction", () => {
    const jobs = { a: job("a", { company: "Stripe" }) };
    expect(findJobBySubject(["a"], jobs, "the Stripe job")?.id).toBe("a");
    expect(findJobBySubject(["a"], jobs, "stripe")?.id).toBe("a");
  });

  it("prefers the most specific title, not the first shorter title the question happens to contain", () => {
    const jobs = { a: job("a", { title: "Product Manager", company: "Google" }), b: job("b", { title: "Senior Product Manager, Platform", company: "Razorpay" }) };
    expect(findJobBySubject(["a", "b"], jobs, "the Senior Product Manager, Platform role")?.id).toBe("b");
  });

  it("a named company wins over a title match", () => {
    const jobs = { a: job("a", { title: "Product Manager", company: "Google" }), b: job("b", { title: "Senior Product Manager", company: "Zerodha" }) };
    expect(findJobBySubject(["a", "b"], jobs, "the Zerodha product manager job")?.id).toBe("b");
  });

  it("returns undefined for an empty subject or no match, never a guess", () => {
    const jobs = { a: job("a", { company: "Acme" }) };
    expect(findJobBySubject(["a"], jobs, "")).toBeUndefined();
    expect(findJobBySubject(["a"], jobs, "a completely different company")).toBeUndefined();
  });
});
