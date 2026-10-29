import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { companyLines } from "@/domain/jobslake/companies";
import { theirStackFacts } from "@/server/jobs/theirstack";
import { __MemoryCompanies, companiesFrom, companyBriefs, companyDirectory, companyProfile, recordCompanyFacts } from "./companies";
import { refreshCompanies } from "./companyRefresh";
import { h1bRows, loadH1b } from "./h1b";
import { wikidataFacts } from "./wikidata";

const FILE = { fiscalYear: 2026, through: "FY2026 Q3", employers: [{ name: "Stripe, LLC", filings: 202, medianWage: 160368 }, { name: "Stripe, Inc.", filings: 40, medianWage: 171621 }, { name: "Figma, Inc.", filings: 61, medianWage: 202959 }] };
const opp = (name: string, domain: string, postedAt: string) =>
  ({ employer: { name, domain }, postedAt, canonicalApplyUrl: "https://x.example/1", applyPath: "platform", quality: { employerVerified: false }, sourceRecords: [{ sourceId: "theirstack" }] }) as unknown as CanonicalOpportunity;

describe("WorksLake company facts", () => {
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

  it("the daily refresh counts new postings; a profile reads facts and H-1B totals from their one home each", async () => {
    const store = new __MemoryCompanies();
    await loadH1b(FILE, store);
    const now = Date.parse("2026-10-24T00:00:00Z");
    const facts = { employeeRange: "1001-5000", industry: "internet", from: "TheirStack" };
    await recordCompanyFacts([{ domain: "www.figma.com", name: "Figma", facts, source: "theirstack" }], store);
    await refreshCompanies({ now, store, logoLimit: 0, wikidata: async () => new Map(), postings: async () => [opp("Figma", "figma.com", "2026-10-22T00:00:00Z"), opp("Figma", "figma.com", "2026-10-12T00:00:00Z"), opp("Acme", "acme.com", "2026-10-23T00:00:00Z")] });
    expect(store.rows.get("figma.com")).toMatchObject({ openJobs: 2, newJobs7d: 1, facts, sources: ["theirstack"] });
    expect(store.rows.get("acme.com")).toMatchObject({ openJobs: 1, newJobs7d: 1 });
    // H-1B totals are never copied onto a company.
    expect([...store.rows.values()].some((r) => "h1b" in r)).toBe(false);

    const p = await companyProfile({ domain: "figma.com" }, store);
    expect(companyLines(p!)).toEqual([
      { label: "Size", value: "1001–5000 employees", source: "TheirStack" },
      { label: "Industry", value: "Internet", source: "TheirStack" },
      { label: "Hiring", value: "2 open roles · 1 new this week", source: "WorksLake, last two weeks" },
      { label: "H-1B visas", value: "61 certified applications · median $202,959", source: "US Dept. of Labor, FY2026 Q3" },
    ]);
    // A company WorksLake has no domain for still gets its H-1B totals by name; one it knows nothing about, nothing.
    expect((await companyProfile({ name: "Stripe Inc" }, store))?.h1b?.filings).toBe(242);
    expect(await companyProfile({ name: "Nobody Ltd" }, store)).toBeUndefined();
  });

  it("a search's company records carry identity only; facts recorded earlier stay where they are", async () => {
    const store = new __MemoryCompanies();
    await recordCompanyFacts([{ domain: "figma.com", name: "Figma", facts: { industry: "internet", from: "TheirStack" }, source: "theirstack" }], store);
    const [c] = companiesFrom([opp("Figma", "figma.com", "2026-10-22T00:00:00Z")], "2026-10-24T00:00:00Z");
    expect(c.facts).toBeUndefined();
    await store.upsert([c]);
    expect(store.rows.get("figma.com")?.facts).toEqual({ industry: "internet", from: "TheirStack" });
    expect(store.rows.size).toBe(1);
  });
});

describe("Wikidata company facts", () => {
  const rows = (vars: Record<string, string>[]) => ({ results: { bindings: vars.map((v) => Object.fromEntries(Object.entries(v).map(([k, value]) => [k, { value }]))) } });
  const fetcher = (async (_url: string, init: RequestInit) => {
    const q = new URLSearchParams(String(init.body)).get("query") ?? "";
    const site = "https://www.figma.com";
    const body = q.includes("P1128")
      ? rows([{ site, item: "http://www.wikidata.org/entity/Q1", employees: "300", at: "2020-01-01T00:00:00Z" }, { site, item: "http://www.wikidata.org/entity/Q1", employees: "1500", at: "2024-01-01T00:00:00Z" }])
      : q.includes("P2139")
        ? rows([{ site, item: "http://www.wikidata.org/entity/Q2", revenue: "749000000", unitLabel: "United States dollar", at: "2024-01-01T00:00:00Z" }])
        : rows([{ site, item: "http://www.wikidata.org/entity/Q1", inception: "2012-01-01T00:00:00Z", hqLabel: "San Francisco", countryLabel: "United States", industryLabel: "software industry" }, { site, item: "http://www.wikidata.org/entity/Q2", ticker: "FIG", exchangeLabel: "New York Stock Exchange" }]);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;

  it("matches companies by their official website, takes the latest dated figures and merges items for one site", async () => {
    const m = await wikidataFacts(["figma.com", "nobody.example"], fetcher);
    expect([...m.keys()]).toEqual(["figma.com"]);
    const f = m.get("figma.com")!;
    expect(f).toMatchObject({ from: "Wikidata", founded: 2012, hqCity: "San Francisco", employees: 1500, employeesAsOf: 2024, ticker: "FIG", revenue: { amount: 749000000, currency: "United States dollar", year: 2024 } });
    expect(companyLines({ name: "Figma", wikidata: f })).toEqual([
      { label: "Size", value: "1,500 employees", source: "Wikidata, 2024", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
      { label: "Industry", value: "Software industry", source: "Wikidata", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
      { label: "Headquarters", value: "San Francisco, United States", source: "Wikidata", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
      { label: "Founded", value: "2012", source: "Wikidata", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
      { label: "Listed", value: "New York Stock Exchange: FIG", source: "Wikidata", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
      { label: "Revenue", value: "$749M", source: "Wikidata, 2024", href: `https://www.wikidata.org/wiki/${f.sourceId}` },
    ]);
  });

  it("the daily refresh stores Wikidata's facts, and that it had none, so neither is looked up again for a month", async () => {
    const store = new __MemoryCompanies();
    const now = Date.parse("2026-10-24T00:00:00Z");
    const r = await refreshCompanies({ now, store, logoLimit: 0, fetcher, postings: async () => [opp("Figma", "figma.com", "2026-10-22T00:00:00Z"), opp("Acme", "acme.com", "2026-10-22T00:00:00Z")] });
    expect(r).toMatchObject({ wikidataChecked: 2, wikidataFound: 1 });
    expect(store.rows.get("figma.com")?.wikidata).toMatchObject({ founded: 2012 });
    expect(store.rows.get("acme.com")?.wikidata).toBeNull();
    expect((await refreshCompanies({ now, store, logoLimit: 0, fetcher, postings: async () => [] })).wikidataChecked).toBe(0);
  });
});

describe("job card company briefs", () => {
  it("gives each page's companies their size and H-1B filings in one go, by domain or by name", async () => {
    const store = new __MemoryCompanies();
    await loadH1b(FILE, store);
    await recordCompanyFacts([{ domain: "figma.com", name: "Figma", facts: { employeeRange: "1001-5000", from: "TheirStack" }, source: "theirstack" }], store);
    const b = await companyBriefs([{ d: "figma.com", n: "Figma" }, { n: "Stripe, Inc." }, { n: "Nobody Ltd" }], store);
    expect(b).toEqual({ "figma.com": { size: "1K–5K employees", h1b: 61 }, "n:stripe, inc.": { h1b: 242 } });
  });
});

describe("the admin company directory", () => {
  it("lists companies most open roles first, with facts and H-1B totals, and searches by name or domain", async () => {
    const store = new __MemoryCompanies();
    await loadH1b(FILE, store);
    await store.upsert([
      { domain: "figma.com", name: "Figma, Inc.", nameKey: "figma", sources: ["greenhouse"], firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-10-24T00:00:00Z", openJobs: 8, countedAt: "2026-10-24T00:00:00Z" },
      { domain: "acme.com", name: "Acme", nameKey: "acme", sources: ["adzuna"], firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-10-24T00:00:00Z", openJobs: 20, countedAt: "2026-10-24T00:00:00Z" },
    ]);
    const all = await companyDirectory("", 50, 0, store);
    expect(all.total).toBe(2);
    expect(all.companies.map((c) => c.domain)).toEqual(["acme.com", "figma.com"]);
    expect(all.companies[1].h1b?.filings).toBe(61);
    expect(all.companies[0].h1b).toBeUndefined();
    expect((await companyDirectory("figma", 50, 0, store)).companies.map((c) => c.domain)).toEqual(["figma.com"]);
    expect((await companyDirectory("", 1, 1, store)).companies.map((c) => c.domain)).toEqual(["figma.com"]);
  });
});
