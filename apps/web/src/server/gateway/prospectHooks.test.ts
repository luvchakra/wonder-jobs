import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests } from "@/server/db/table";
import { __MemoryCompanies, __setCompanyStore } from "@/server/jobslake/companies";
import { adminCall } from "./admin";
import { hostedGateway } from "./index";
import { companyFacts } from "./prospectHooks";
import { issueProspectKey, setOutsideConsumers } from "./prospectsAdmin";
import { resetGatewayListingsForTests } from "./store";

// WJ-818: enrich asks WorksLake's company directory first (docs/PROSPECT_DATA_API.md, A4).
const at = "2026-10-30T00:00:00.000Z";
const record = (over: Record<string, unknown>) => ({ domain: "acme.example", name: "Acme", nameKey: "acme", sources: ["src"], firstSeenAt: at, lastSeenAt: at, ...over });

beforeEach(() => {
  resetTablesForTests();
  resetGatewayListingsForTests();
  delete (globalThis as { __wlGateway?: unknown }).__wlGateway;
  vi.unstubAllEnvs();
  vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
  vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
});
afterEach(() => {
  __setCompanyStore(undefined);
  vi.unstubAllEnvs();
});

describe("the company directory as enrich's first source", () => {
  it("gives reported facts first, then Wikidata's, each with its source; a head count is never turned into a band", async () => {
    const store = new __MemoryCompanies();
    await store.upsert([record({ facts: { industry: "Software", employees: 1200, from: "theirstack" }, factsAt: at, wikidata: { industry: "Information technology", employeeRange: "1001-5000", hqCity: "Pune", hqCountry: "India", sourceId: "Q1", from: "wikidata" }, wikidataAt: at }) as never]);
    __setCompanyStore(store);
    const facts = await companyFacts({ domain: "https://www.Acme.example/", name: "" });
    expect(facts).toEqual([
      { field: "industry", value: "Software", source: { provider: "workslake", name: "WorksLake company directory", url: null, termsPending: true }, observedAt: at },
      { field: "industry", value: "Information technology", source: { provider: "wikidata", name: "Wikidata", url: "https://www.wikidata.org/wiki/Q1", termsPending: false }, observedAt: at },
      { field: "employeeRange", value: "1001-5000", source: expect.objectContaining({ provider: "wikidata" }), observedAt: at },
      { field: "hq", value: "Pune, India", source: expect.objectContaining({ provider: "wikidata" }), observedAt: at },
    ]);
    expect(await companyFacts({ domain: "", name: "Acme" })).toHaveLength(4);
    expect(await companyFacts({ domain: "unknown.example", name: "Nobody" })).toEqual([]);
  });

  it("the hosted gateway's enrich returns the directory's values at zero units, with nothing fetched for a field it filled", async () => {
    const store = new __MemoryCompanies();
    await store.upsert([record({ wikidata: { industry: "Information technology", hqCity: "Pune", hqCountry: "India", sourceId: "Q1", from: "wikidata" }, wikidataAt: at }) as never]);
    __setCompanyStore(store);
    await setOutsideConsumers(true);
    const key = String((await issueProspectKey()).body.key);
    expect((await adminCall("/v1/admin/settings", { quotas: { search: 5 } })).status).toBe(200);
    const res = await hostedGateway()!.gateway.handle(new Request("http://localhost/v1/prospects/enrich", { method: "POST", headers: { authorization: `Bearer ${key}`, "x-tenant-id": "biz_0f3a9c1e-5b7d", "content-type": "application/json" }, body: JSON.stringify({ domain: "acme.example", fields: ["industry", "hq"], allowPaid: false }) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fields: Record<string, { value: string; source: { provider: string; url: string } } | null>; usage: { unitsSpent: number }; metadata: { providers: { id: string }[] } };
    expect(body.fields.industry).toMatchObject({ value: "Information technology", source: { provider: "wikidata", url: "https://www.wikidata.org/wiki/Q1" } });
    expect(body.fields.hq?.value).toBe("Pune, India");
    expect(body.usage.unitsSpent).toBe(0);
    // Both fields came from the directory, so neither the stored data nor the organisation's site was asked.
    expect(body.metadata.providers.map((p) => p.id)).toEqual(["directory"]);
  });
});

// WJ-819: hiring signals from WorksLake's own job data (A7).
import { hiringSignals } from "./prospectHooks";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

describe("hiring signals", () => {
  const NOW = Date.parse("2026-11-11T00:00:00Z");
  const posting = (over: Partial<CanonicalOpportunity>): CanonicalOpportunity =>
    ({ id: "o" + Math.random(), employer: { name: "Acme", domain: "acme-co.com" }, title: "IAM Engineer", normalizedTitle: "iam engineer", locations: ["Pune"], country: "India", description: "Work with Saviynt and SailPoint. Apply at https://jobs.acme-co.com/1", requirements: [], niceToHave: [], skills: ["Saviynt"], postedAt: "2026-11-05T00:00:00.000Z", canonicalApplyUrl: "https://jobs.acme-co.com/1", applyPath: "employer_site", sourceRecords: [{ sourceId: "src" }], quality: { employerVerified: true }, ...over }) as unknown as CanonicalOpportunity;

  it("counts matching postings per company and returns titles, never descriptions, links or anything about who posted", async () => {
    const store = new __MemoryCompanies();
    await store.upsert([record({ domain: "acme-co.com", openJobs: 6, newJobs7d: 2, wikidata: { industry: "Software", hqCity: "Pune", hqCountry: "India", sourceId: "Q1", from: "wikidata" }, facts: { industry: "Reported by a job source", from: "theirstack" } }) as never]);
    __setCompanyStore(store);
    const postings = [
      posting({}),
      posting({ title: "Identity Governance Lead", skills: [] }),
      posting({ title: "Accountant", description: "Books and GST.", skills: [] }),
      posting({ employer: { name: "Beta", domain: "beta-co.com" }, title: "SailPoint Developer", locations: ["London"], country: "United Kingdom" }),
      posting({ employer: { name: "No Domain Ltd" }, canonicalApplyUrl: "https://jobboard.example/x", applyPath: "platform", title: "Saviynt Admin" }),
      posting({ title: "Old Saviynt role", postedAt: "2026-09-01T00:00:00.000Z" }),
      posting({ kind: "event", title: "Saviynt meetup" }),
    ];
    const all = await hiringSignals({ keywords: ["saviynt", "sailpoint"], places: [], countries: [], sinceDays: 30 }, NOW, postings);
    expect(all.postingsRead).toBe(7);
    expect(all.companies.map((c) => [c.domain, c.matched])).toEqual([["acme-co.com", 2], ["beta-co.com", 1]]);
    expect(all.companies[0]).toMatchObject({ name: "Acme", matchedTitles: ["IAM Engineer", "Identity Governance Lead"], openJobs: 6, newJobs7d: 2, industry: "Software", hq: "Pune, India", factsSource: { provider: "wikidata" } });
    const sent = JSON.stringify(all);
    for (const never of ["jobs.acme-co.com", "Apply at", "Work with", "Reported by a job source", "theirstack"]) expect(sent).not.toContain(never);
    // By country code and by place words.
    expect((await hiringSignals({ keywords: ["sailpoint"], places: [], countries: ["IN"], sinceDays: 30 }, NOW, postings)).companies.map((c) => c.domain)).toEqual(["acme-co.com"]);
    expect((await hiringSignals({ keywords: ["sailpoint"], places: ["london"], countries: [], sinceDays: 30 }, NOW, postings)).companies.map((c) => c.domain)).toEqual(["beta-co.com"]);
    expect((await hiringSignals({ keywords: ["kubernetes"], places: [], countries: [], sinceDays: 30 }, NOW, postings)).companies).toEqual([]);
  });
});

import { providerKeys } from "./prospectHooks";
import { __resetPlatformKeys } from "@/server/jobslake/platformKeys";
import { prospectAdminView } from "./prospectsAdmin";

describe("live providers' keys (WJ-822)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetPlatformKeys();
  });

  it("hands the gateway only the keys its providers name, and nothing when none is set", async () => {
    expect(Object.keys(await providerKeys()).sort()).toEqual(["GOOGLE_PLACES_API_KEY", "PODCAST_INDEX_KEY", "PODCAST_INDEX_SECRET", "YOUTUBE_API_KEY"]);
    expect(Object.values(await providerKeys()).every((v) => v === undefined)).toBe(true);
    vi.stubEnv("YOUTUBE_API_KEY", " yt-key ");
    vi.stubEnv("SMTP_PASS", "not-a-provider-key");
    const keys = await providerKeys();
    expect(keys.YOUTUBE_API_KEY).toBe("yt-key");
    expect(JSON.stringify(keys)).not.toContain("not-a-provider-key");
  });

  it("the admin card shows each provider as Needs setup until its key is set, and never the key", async () => {
    let view = await prospectAdminView();
    expect(view.providers.map((p) => [p.id, p.ready, p.paid, p.cacheHours])).toEqual([["google_places", false, true, 0], ["youtube", false, false, 24], ["podcast_index", false, false, 24]]);
    expect(view.providers.every((p) => p.termsPending)).toBe(true);
    vi.stubEnv("PODCAST_INDEX_KEY", "pi-key");
    expect((await prospectAdminView()).providers.find((p) => p.id === "podcast_index")?.ready).toBe(false);
    vi.stubEnv("PODCAST_INDEX_SECRET", "pi-secret-value");
    view = await prospectAdminView();
    expect(view.providers.find((p) => p.id === "podcast_index")?.ready).toBe(true);
    expect(JSON.stringify(view)).not.toContain("pi-secret-value");
  });
});
