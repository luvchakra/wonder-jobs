import { describe, expect, it } from "vitest";
import { describeDecision } from "./decision";
import { compareJobs } from "./compare";
import type { Application } from "@/domain/applications/types";
import type { AlignmentReason, CanonicalJob, JobMatch, JobQuality } from "./types";

function job(id: string, over: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id,
    canonicalKey: id,
    sourceIds: ["jobicy"],
    duplicateOf: [],
    title: "Director, Identity",
    company: `Co ${id}`,
    location: "Mumbai",
    country: "IN",
    workMode: "hybrid",
    currency: "INR",
    salaryMax: 6_000_000,
    postedAt: "2026-09-20T00:00:00Z",
    observedAt: "2026-09-20T00:00:00Z",
    description: "",
    requirements: [],
    niceToHave: [],
    skills: [],
    seniority: "director",
    industry: "Fintech",
    applyUrl: "https://example.com",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: [],
    ...over,
  };
}

const R = (dimension: AlignmentReason["dimension"], score: number, summary = `${dimension} summary`): AlignmentReason => ({ dimension, label: dimension, score, summary });

function match(id: string, fit: JobMatch["fit"], reasons: AlignmentReason[]): JobMatch {
  return { jobId: id, score: 80, fit, reasons, highlights: [], computedAt: "" };
}

const STRONG = [R("skills", 0.9), R("seniority", 1), R("industry", 1), R("career_goal", 1), R("location", 1), R("compensation", 1)];

describe("describeDecision — why / consider / next, only from computed scores and observed signals", () => {
  it("lists the strong reasons and suggests preparing for a strong opportunity", () => {
    const d = describeDecision(job("a"), match("a", "strong", STRONG), undefined);
    // Strongest first, capped at four: the 0.9 skills overlap ranks below the four perfect scores.
    expect(d.why).toEqual(["Seniority aligns", "Fintech is one of your target industries", "Matches your career goal", "Location works for you"]);
    expect(d.consider).toEqual([]);
    expect(d.next).toEqual({ label: "Prepare an application", kind: "prepare" });
  });

  it("names real concerns: undisclosed pay, partial industry fit, caution quality signals", () => {
    const j = job("a", { salaryMax: undefined });
    const q: JobQuality = { jobId: "a", confidence: "moderate", summary: "", signals: [{ key: "employer_site", label: "Employer career-page presence", value: "Not found on employer site", sentiment: "caution" }, { key: "freshness", label: "Posting freshness", value: "Posted 3 days ago", sentiment: "positive" }] };
    const d = describeDecision(j, match("a", "worth_considering", [R("skills", 0.8), R("seniority", 1), R("industry", 0.55), R("career_goal", 0.9), R("location", 1), R("compensation", 0.8)]), q);
    expect(d.consider).toEqual(["Fintech is outside your target industries", "Compensation isn't disclosed", "Not found on the employer's own careers site"]);
    expect(d.next.kind).toBe("look");
  });

  it("never claims pay meets your minimum when the salary isn't disclosed", () => {
    const d = describeDecision(job("a", { salaryMax: undefined }), match("a", "strong", [R("compensation", 0.9)]), undefined);
    expect(d.why).not.toContain("Pay meets your minimum");
  });

  it("follows the application's real state for the next suggestion", () => {
    const app = (status: Application["status"]) => ({ id: "x", jobId: "a", status }) as Application;
    expect(describeDecision(job("a"), match("a", "strong", STRONG), undefined, app("ready_for_review")).next.kind).toBe("review_pack");
    expect(describeDecision(job("a"), match("a", "strong", STRONG), undefined, app("preparing")).next.kind).toBe("continue_pack");
    expect(describeDecision(job("a"), match("a", "strong", STRONG), undefined, app("interview")).next.kind).toBe("track");
  });

  it("with no match yet, suggests a closer look and claims nothing", () => {
    const d = describeDecision(job("a"), undefined, undefined);
    expect(d.why).toEqual([]);
    expect(d.next.kind).toBe("look");
  });
});

describe("compareJobs — relative observations, never an overall winner", () => {
  it("names the job that's genuinely closer on a dimension and stays silent on near-ties", () => {
    const a = job("a", { title: "Director, Identity", company: "Acme" });
    const b = job("b", { title: "VP, IAM", company: "Beta" });
    const matches = {
      a: match("a", "strong", [R("seniority", 1), R("skills", 0.6), R("location", 1)]),
      b: match("b", "worth_considering", [R("seniority", 0.8), R("skills", 0.9), R("location", 0.95)]),
    };
    const r = compareJobs([a, b], matches, {});
    expect(r.observations).toEqual(["Director, Identity at Acme aligns more closely with your target seniority.", "VP, IAM at Beta is a stronger match on your skills."]);
    expect(r.observations.join(" ")).not.toMatch(/better overall|winner|best choice/i);
    expect(r.rows.find((x) => x.key === "fit")?.values).toEqual(["Strong Opportunity", "Worth Considering"]);
    expect(r.rows.find((x) => x.key === "trajectory")?.values).toEqual(["Same level", "One step up"]);
  });
});
