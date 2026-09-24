import { describe, expect, it } from "vitest";
import { resolveWonderQuery, type WonderContext } from "./resolve";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobFilters, JobMatch } from "@/domain/jobs/types";
import { DEFAULT_FILTERS } from "@/store/jobs";

const NOW = Date.now();

function job(id: string, over: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id,
    canonicalKey: id,
    sourceIds: ["remotive"],
    duplicateOf: [],
    title: "Product Manager",
    company: "Acme",
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
function match(id: string, fit: JobMatch["fit"] = "strong"): JobMatch {
  return { jobId: id, score: 80, fit, reasons: [], highlights: [], computedAt: new Date().toISOString() };
}
function baseCtx(over: Partial<WonderContext> = {}): WonderContext {
  return { dna: { skills: [] }, jobsOrder: [], jobs: {}, matches: {}, rejected: {}, saved: {}, filters: DEFAULT_FILTERS, applications: {}, now: NOW, ...over };
}

describe("resolveWonderQuery", () => {
  it("returns null for a plain job search, leaving the caller's default behavior alone", () => {
    expect(resolveWonderQuery("remote react roles", baseCtx())).toBeNull();
  });

  it("resolves a headline request without fabricating LinkedIn access", () => {
    const r = resolveWonderQuery("improve my linkedin headline", baseCtx());
    expect(r?.href).toBe("/app/career-dna");
    expect(r?.hint).toMatch(/LinkedIn isn't connected/);
  });

  it("resolves missing-skills from the candidate's own jobs, not a canned list", () => {
    const jobs = { a: job("a", { skills: ["SQL"] }) };
    const ctx = baseCtx({ jobsOrder: ["a"], jobs, matches: { a: match("a", "strong") } });
    const r = resolveWonderQuery("what skills am I missing", ctx);
    expect(r?.hint).toBe("SQL");
  });

  it("says so honestly when there's no skill gap", () => {
    const ctx = baseCtx();
    const r = resolveWonderQuery("what skills am I missing", ctx);
    expect(r?.label).toMatch(/No skill gaps/);
  });

  it("resolves applications-needing-attention with a real count", () => {
    const applications: Record<string, Application> = {
      a1: { id: "a1", jobId: "j1", status: "ready_for_review", appliedAt: undefined, followUps: [], events: [], notes: [] } as unknown as Application,
    };
    const r = resolveWonderQuery("what applications need my attention", baseCtx({ applications }));
    expect(r?.href).toBe("/app/applications");
    expect(r?.label).toMatch(/^\d+ application/);
  });

  it("resolves a scheduling request into the closest real template with the candidate's own search text", () => {
    const r = resolveWonderQuery("search for backend engineer roles weekly", baseCtx());
    expect(r?.href).toContain("often=weekly");
    expect(r?.href).toContain(encodeURIComponent("backend engineer roles"));
  });

  it("explains a job is hidden by an active filter, matching the same reason applyJobFilters would give", () => {
    const jobs = { a: job("a", { workMode: "onsite", title: "Backend Engineer" }) };
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] };
    const ctx = baseCtx({ jobsOrder: ["a"], jobs, matches: { a: match("a") }, filters });
    const r = resolveWonderQuery("why isn't the backend engineer role showing", ctx);
    expect(r?.label).toMatch(/a different work mode/);
    expect(r?.href).toBe("/app/jobs/a");
  });

  it("says a job isn't in the results at all when it can't find it, rather than guessing", () => {
    const r = resolveWonderQuery("why isn't the mystery role showing", baseCtx());
    expect(r?.label).toMatch(/isn't in your current search results/);
  });

  it("resolves prepare-application to the matching job's page when found", () => {
    const jobs = { a: job("a", { company: "Stripe" }) };
    const ctx = baseCtx({ jobsOrder: ["a"], jobs });
    const r = resolveWonderQuery("prepare an application for Stripe", ctx);
    expect(r?.href).toBe("/app/jobs/a");
  });

  it("returns null for prepare-application when no matching job exists, never fabricating one", () => {
    const r = resolveWonderQuery("prepare an application for Stripe", baseCtx());
    expect(r).toBeNull();
  });
});
