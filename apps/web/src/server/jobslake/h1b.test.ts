import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { companyLines } from "@/domain/jobslake/companies";
import { theirStackFacts } from "@/server/jobs/theirstack";
import { __MemoryCompanies, companiesFrom, companyProfile } from "./companies";
import { refreshCompanies } from "./companyRefresh";
import { h1bRows, loadH1b } from "./h1b";

const FILE = { fiscalYear: 2026, through: "FY2026 Q3", employers: [{ name: "Stripe, LLC", filings: 202, medianWage: 160368 }, { name: "Stripe, Inc.", filings: 40, medianWage: 171621 }, { name: "Figma, Inc.", filings: 61, medianWage: 202959 }] };
const opp = (name: string, domain: string, postedAt: string, facts?: object) =>
  ({ employer: { name, domain, ...(facts ? { facts } : {}) }, postedAt, canonicalApplyUrl: "https://x.example/1", applyPath: "platform", quality: { employerVerified: false }, sourceRecords: [{ sourceId: "theirstack" }] }) as unknown as CanonicalOpportunity;

describe("JobsLake company facts", () => {
  it("totals a Department of Labor file per company name, merging names that normalise the same", () => {
    const rows = h1bRows(FILE);
    expect(rows.find((r) => r.nameKey === "stripe")).toEqual({ nameKey: "stripe", name: "Stripe, LLC", filings: 242, medianWage: 160368, fiscalYear: 2026, through: "FY2026 Q3" });
    expect(rows.find((r) => r.nameKey === "figma")?.filings).toBe(61);
    expect(() => h1bRows({ ...FILE, through: "last year" })).toThrow();
  });

  it("keeps only what TheirStack reports about the company, and nothing when it's blurred", () => {
    expect(theirStackFacts({ industry: "internet", employee_count: 1234.4, country: "United States", funding_stage: "series_c", founded_year: null })).toEqual({ industry: "internet", employees: 1234, hqCountry: "United States", fundingStage: "series_c", from: "TheirStack" });
    expect(theirStackFacts({ industry: "internet", has_blurred_data: true })).toBeUndefined();
    expect(theirStackFacts({ name: "Acme" })).toBeUndefined();
  });

  it("the daily refresh counts new postings and copies H-1B totals; a profile shows each fact with its source", async () => {
    const store = new __MemoryCompanies();
    await loadH1b(FILE, store);
    const now = Date.parse("2026-10-24T00:00:00Z");
    const facts = { employeeRange: "1001-5000", industry: "internet", from: "TheirStack" };
    await refreshCompanies({ now, store, logoLimit: 0, postings: async () => [opp("Figma", "figma.com", "2026-10-22T00:00:00Z", facts), opp("Figma", "figma.com", "2026-10-12T00:00:00Z"), opp("Acme", "acme.com", "2026-10-23T00:00:00Z")] });
    expect(store.rows.get("figma.com")).toMatchObject({ openJobs: 2, newJobs7d: 1, facts, h1b: { filings: 61, through: "FY2026 Q3" } });
    expect(store.rows.get("acme.com")).toMatchObject({ openJobs: 1, newJobs7d: 1, h1b: null });

    const p = await companyProfile({ domain: "figma.com" }, store);
    expect(companyLines(p!)).toEqual([
      { label: "Size", value: "1001–5000 employees", source: "TheirStack" },
      { label: "Industry", value: "Internet", source: "TheirStack" },
      { label: "Hiring", value: "2 open roles · 1 new this week", source: "JobsLake, last two weeks" },
      { label: "H-1B visas", value: "61 certified applications · median $202,959", source: "US Dept. of Labor, FY2026 Q3" },
    ]);
    // A company JobsLake has no domain for still gets its H-1B totals by name; one it knows nothing about, nothing.
    expect((await companyProfile({ name: "Stripe Inc" }, store))?.h1b?.filings).toBe(242);
    expect(await companyProfile({ name: "Nobody Ltd" }, store)).toBeUndefined();
  });

  it("a search's companies keep the facts their postings carried", () => {
    const [c] = companiesFrom([opp("Figma", "figma.com", "2026-10-22T00:00:00Z", { industry: "internet", from: "TheirStack" })], "2026-10-24T00:00:00Z");
    expect(c.facts).toEqual({ industry: "internet", from: "TheirStack" });
  });
});
