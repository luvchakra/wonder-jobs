import { describe, expect, it } from "vitest";
import { applyJobFilters, type FilterReason } from "./filterExplain";
import { DEFAULT_FILTERS } from "@/store/jobs";
import type { CanonicalJob, JobFilters, JobMatch } from "@/domain/jobs/types";

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
    postedAt: new Date(NOW - DAYms(1)).toISOString(),
    observedAt: new Date().toISOString(),
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
function DAYms(n: number) {
  return n * 86_400_000;
}
function match(id: string, fit: JobMatch["fit"] = "strong"): JobMatch {
  return { jobId: id, score: fit === "strong" ? 90 : fit === "worth_considering" ? 70 : fit === "stretch" ? 60 : 30, fit, reasons: [], highlights: [], computedAt: new Date().toISOString() };
}

describe("applyJobFilters", () => {
  it("shows everything when no filters are active", () => {
    const jobs = { a: job("a"), b: job("b") };
    const matches = { a: match("a"), b: match("b") };
    const r = applyJobFilters(["a", "b"], jobs, matches, {}, {}, DEFAULT_FILTERS, NOW);
    expect(r.visibleIds).toEqual(["a", "b"]);
    expect(r.hiddenTotal).toBe(0);
    expect(r.hiddenByReason).toEqual({});
  });

  it("attributes a rejected job to 'rejected', taking priority over every other filter", () => {
    const jobs = { a: job("a", { workMode: "onsite" }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] }; // would also fail work_mode
    const r = applyJobFilters(["a"], jobs, matches, { a: NOW.toString() }, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ rejected: 1 });
  });

  it("counts a job hidden by 'Saved only'", () => {
    const jobs = { a: job("a") };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, onlySaved: true };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ not_saved: 1 });
  });

  it("counts a job hidden by work mode", () => {
    const jobs = { a: job("a", { workMode: "onsite" }), b: job("b", { workMode: "remote" }) };
    const matches = { a: match("a"), b: match("b") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] };
    const r = applyJobFilters(["a", "b"], jobs, matches, {}, {}, filters, NOW);
    expect(r.visibleIds).toEqual(["b"]);
    expect(r.hiddenByReason).toEqual({ work_mode: 1 });
  });

  it("counts a job hidden by source", () => {
    const jobs = { a: job("a", { sourceIds: ["adzuna"] }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, sourceIds: ["remotive"] };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ source: 1 });
  });

  it("counts a job hidden by minimum fit", () => {
    const jobs = { a: job("a") };
    const matches = { a: match("a", "stretch") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, minFit: "worth_considering" };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ min_fit: 1 });
  });

  it("treats a job with no computed match yet as failing a minimum-fit filter", () => {
    const jobs = { a: job("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, minFit: "strong" };
    const r = applyJobFilters(["a"], jobs, {}, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ min_fit: 1 });
  });

  it("counts a job hidden by freshness", () => {
    const jobs = { a: job("a", { postedAt: new Date(NOW - DAYms(30)).toISOString() }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, freshnessDays: 7 };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ freshness: 1 });
  });

  it("counts a job hidden by minimum salary, converting non-INR to INR the same way the page does", () => {
    const jobs = { a: job("a", { currency: "USD", salaryMax: 50_000 }) }; // 50,000 * 30 = 1,500,000
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, minSalary: 2_000_000 };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ min_salary: 1 });
  });

  it("counts an undisclosed salary as hidden when a minimum is set, never inventing a number", () => {
    const jobs = { a: job("a", { salaryMax: undefined }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, minSalary: 1_000_000 };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ min_salary: 1 });
  });

  it("counts a job hidden by search text", () => {
    const jobs = { a: job("a", { title: "Backend Engineer" }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, query: "product manager" };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ search_text: 1 });
  });

  it("sums reasons across many jobs without double-counting any one job", () => {
    const jobs = {
      a: job("a", { workMode: "onsite" }), // fails work_mode
      b: job("b", { workMode: "onsite" }), // fails work_mode
      c: job("c"), // visible
    };
    const matches = { a: match("a"), b: match("b"), c: match("c") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] };
    const r = applyJobFilters(["a", "b", "c"], jobs, matches, {}, {}, filters, NOW);
    expect(r.totalCatalog).toBe(3);
    expect(r.visibleIds).toEqual(["c"]);
    expect(r.hiddenTotal).toBe(2);
    expect(r.hiddenByReason).toEqual({ work_mode: 2 });
    const summed = Object.values(r.hiddenByReason as Record<FilterReason, number>).reduce((n, v) => n + v, 0);
    expect(summed).toBe(r.hiddenTotal);
    expect(r.visibleIds.length + r.hiddenTotal).toBe(r.totalCatalog);
  });

  it("skips a catalog id with no job data rather than crashing or miscounting", () => {
    const jobs = { a: job("a") };
    const matches = { a: match("a") };
    const r = applyJobFilters(["a", "ghost-id"], jobs, matches, {}, {}, DEFAULT_FILTERS, NOW);
    expect(r.totalCatalog).toBe(1);
    expect(r.visibleIds).toEqual(["a"]);
  });
});
