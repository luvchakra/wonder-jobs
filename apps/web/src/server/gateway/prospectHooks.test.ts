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
