import { describe, expect, it } from "vitest";
import { applyJobFilters, explainJobVisibility, type FilterReason } from "./filterExplain";
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

  it("hides jobs already in the Pipeline only when asked", () => {
    const jobs = { a: job("a"), b: job("b") };
    const matches = { a: match("a"), b: match("b") };
    const inPipeline = new Set(["a"]);
    expect(applyJobFilters(["a", "b"], jobs, matches, {}, {}, DEFAULT_FILTERS, NOW, [], inPipeline).visibleIds).toEqual(["a", "b"]);
    const r = applyJobFilters(["a", "b"], jobs, matches, {}, {}, { ...DEFAULT_FILTERS, hideInPipeline: true }, NOW, [], inPipeline);
    expect(r.visibleIds).toEqual(["b"]);
    expect(r.hiddenByReason).toEqual({ in_pipeline: 1 });
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
    const jobs = { a: job("a", { postedAt: new Date(NOW - DAYms(10)).toISOString() }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, freshnessDays: 7 };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.hiddenByReason).toEqual({ freshness: 1 });
  });

  it("hides postings older than two weeks as too old, unless saved or asked for", () => {
    const jobs = { a: job("a", { postedAt: new Date(NOW - DAYms(15)).toISOString() }), b: job("b", { postedAt: new Date(NOW - DAYms(13)).toISOString() }), c: job("c", { postedAt: new Date(NOW - DAYms(40)).toISOString() }) };
    const matches = { a: match("a"), b: match("b"), c: match("c") };
    const r = applyJobFilters(["a", "b", "c"], jobs, matches, {}, { c: new Date(NOW).toISOString() }, DEFAULT_FILTERS, NOW);
    expect(r.visibleIds).toEqual(["b", "c"]); // c is saved
    expect(r.hiddenByReason).toEqual({ too_old: 1 });
    expect(applyJobFilters(["a"], jobs, matches, {}, {}, { ...DEFAULT_FILTERS, includeOld: true }, NOW).visibleIds).toEqual(["a"]);
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

  it("shows only the job types picked, and hides postings that state none", () => {
    const jobs = { a: job("a", { title: "Barista", jobType: "part_time", jobTypeFrom: "source" }), b: job("b", { title: "Engineer", jobType: "full_time" }), c: job("c", { title: "Designer" }), d: job("d", { title: "Part-time Tutor" }) };
    const matches = { a: match("a"), b: match("b"), c: match("c"), d: match("d") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, jobTypes: ["part_time"] };
    const r = applyJobFilters(["a", "b", "c", "d"], jobs, matches, {}, {}, filters, NOW);
    expect(r.visibleIds).toEqual(["a", "d"]);
    expect(r.hiddenByReason).toEqual({ job_type: 2 });
  });

  it("doesn't match job-type words against job text", () => {
    const jobs = { a: job("a", { title: "Backend Engineer" }) };
    const filters: JobFilters = { ...DEFAULT_FILTERS, query: "part time backend" };
    expect(applyJobFilters(["a"], jobs, { a: match("a") }, {}, {}, filters, NOW).visibleIds).toEqual(["a"]);
  });

  it("doesn't match pay words against job text", () => {
    const jobs = { a: job("a", { title: "Backend Engineer" }) };
    const matches = { a: match("a") };
    const filters: JobFilters = { ...DEFAULT_FILTERS, query: "high paying jobs" };
    const r = applyJobFilters(["a"], jobs, matches, {}, {}, filters, NOW);
    expect(r.visibleIds).toEqual(["a"]);
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

describe("explainJobVisibility — Ask Wonder's 'why isn't this showing' for one specific job", () => {
  it("says a job isn't in the catalog at all, distinct from being filtered out", () => {
    const r = explainJobVisibility(undefined, {}, {}, {}, DEFAULT_FILTERS, NOW);
    expect(r).toEqual({ inCatalog: false, visible: false, reason: null });
  });

  it("says a visible job is visible, with no reason", () => {
    const j = job("a");
    const r = explainJobVisibility(j, { a: match("a") }, {}, {}, DEFAULT_FILTERS, NOW);
    expect(r).toEqual({ inCatalog: true, visible: true, reason: null });
  });

  it("gives the same reason applyJobFilters would count it under, so the two can never disagree", () => {
    const j = job("a", { workMode: "onsite" });
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] };
    const matches = { a: match("a") };
    const single = explainJobVisibility(j, matches, {}, {}, filters, NOW);
    expect(single).toEqual({ inCatalog: true, visible: false, reason: "work_mode" });
    const bulk = applyJobFilters(["a"], { a: j }, matches, {}, {}, filters, NOW);
    expect(bulk.hiddenByReason).toEqual({ work_mode: 1 });
  });

  it("prioritizes 'rejected' over every other failing filter, matching applyJobFilters", () => {
    const j = job("a", { workMode: "onsite" });
    const filters: JobFilters = { ...DEFAULT_FILTERS, workModes: ["remote"] };
    const r = explainJobVisibility(j, { a: match("a") }, { a: NOW.toString() }, {}, filters, NOW);
    expect(r.reason).toBe("rejected");
  });
});

describe("Refine: level, company, pay listed", () => {
  it("hides jobs at other levels, at other companies, or without pay — and says which", async () => {
    const { applyJobFilters } = await import("./filterExplain");
    const base = { id: "", title: "Product Manager", company: "Razorpay", location: "Bengaluru", country: "IN", workMode: "onsite" as const, currency: "INR", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(), description: "", requirements: [], niceToHave: [], skills: [], seniority: "senior" as const, industry: "Fintech", applyUrl: "https://x", applyPath: "employer_site" as const, onEmployerSite: true, repostCount: 0, tags: [], canonicalKey: "", sourceIds: ["careers"], duplicateOf: [] };
    const jobs = { a: { ...base, id: "a", salaryMax: 4_000_000 }, b: { ...base, id: "b", seniority: "mid" as const, salaryMax: 2_000_000 }, c: { ...base, id: "c", company: "Swiggy", salaryMax: 3_000_000 }, d: { ...base, id: "d" } };
    const f = { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false, levels: ["senior" as const], company: "razor", salaryListed: true };
    const r = applyJobFilters(["a", "b", "c", "d"], jobs, {}, {}, {}, f, Date.now());
    expect(r.visibleIds).toEqual(["a"]);
    expect(r.hiddenByReason).toEqual({ level: 1, company: 1, no_salary: 1 });
  });
});

describe("Search strictly within your Career Profile", () => {
  it("keeps jobs that name the candidate's field where it counts, and says why the rest are hidden", async () => {
    const { applyJobFilters, inProfileField } = await import("./filterExplain");
    const base = { id: "", title: "", company: "Co", location: "Mumbai", country: "IN", workMode: "onsite" as const, currency: "INR", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(), description: "", requirements: [], niceToHave: [], skills: [], seniority: "director" as const, industry: "Technology", applyUrl: "https://x", applyPath: "employer_site" as const, onEmployerSite: true, repostCount: 0, tags: [], canonicalKey: "", sourceIds: ["careers"], duplicateOf: [] };
    const field = ["iam", "identity"];
    const jobs = { a: { ...base, id: "a", title: "Director, Identity and Access Management" }, b: { ...base, id: "b", title: "Sales Director", description: "Sell our IAM products." }, c: { ...base, id: "c", title: "Platform Lead", skills: ["IAM"] } };
    expect(inProfileField(jobs.b, field)).toBe(false); // the field only in the body isn't the role
    const f = { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false, strictProfile: true };
    const r = applyJobFilters(["a", "b", "c"], jobs, {}, {}, {}, f, Date.now(), field);
    expect(r.visibleIds).toEqual(["a", "c"]);
    expect(r.hiddenByReason).toEqual({ profile: 1 });
  });
});

describe("each mode's All (WJ-367: freelance gigs were showing in Full Time)", () => {
  const jobs = {
    perm: job("perm", { jobType: "full_time" }),
    gig: job("gig", { jobType: "gig" }),
    pt: job("pt", { jobType: "part_time" }),
    intern: job("intern", { jobType: "internship" }),
    contract: job("contract", { jobType: "contract" }),
    untyped: job("untyped"),
    titled: job("titled", { title: "Freelance Product Manager" }),
  };
  const ids = Object.keys(jobs);
  const run = (f: Partial<JobFilters>) => applyJobFilters(ids, jobs, {}, {}, {}, { ...DEFAULT_FILTERS, ...f }, NOW).visibleIds;

  it("Full Time leaves out gigs, part-time jobs and internships; a job that states no type shows", () => {
    expect(run({ skipProfile: false })).toEqual(["perm", "contract", "untyped"]);
    expect(applyJobFilters(ids, jobs, {}, {}, {}, { ...DEFAULT_FILTERS, skipProfile: false }, NOW).hiddenByReason.other_mode).toBe(4);
  });

  it("Part Time leaves out full-time jobs", () => {
    expect(run({ skipProfile: true })).toEqual(["gig", "pt", "intern", "contract", "untyped", "titled"]);
  });

  it("a picked job type, and the Saved tab, aren't narrowed by the mode", () => {
    expect(run({ skipProfile: false, jobTypes: ["gig"] })).toEqual(["gig", "titled"]);
    const saved = Object.fromEntries(ids.map((id) => [id, "2026-10-01T00:00:00Z"]));
    expect(applyJobFilters(ids, jobs, {}, {}, saved, { ...DEFAULT_FILTERS, skipProfile: false, onlySaved: true }, NOW).visibleIds).toEqual(ids);
  });

  it("says which mode a hidden job is in", () => {
    expect(explainJobVisibility(jobs.gig, {}, {}, {}, { ...DEFAULT_FILTERS, skipProfile: false }, NOW).reason).toBe("other_mode");
  });
});
