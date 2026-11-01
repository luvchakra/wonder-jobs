import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { __MemoryCompanies, __setCompanyStore, adminLogo, companiesFrom, companyDirectory, companyStore, fetchMissingLogos } from "./companies";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

const opp = (o: Partial<CanonicalOpportunity>): CanonicalOpportunity => ({ id: "x", employer: { name: "" }, title: "PyCon India", canonicalApplyUrl: "https://in.pycon.org/2026", applyPath: "employer_site", quality: { employerVerified: false }, sourceRecords: [{ sourceId: "works_gateway_events" }], ...o }) as unknown as CanonicalOpportunity;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");

describe("logos for every company and event poster", () => {
  it("an event with no organiser is recorded under its own site and title; a school under its own site", () => {
    const recs = companiesFrom([opp({ kind: "event", employer: { name: "", domain: "in.pycon.org" } }), opp({ title: "Maths Teacher", employer: { name: "Brixham College", domain: "brixhamcollege.co.uk" } }), opp({ title: "No site", employer: { name: "" } })]);
    expect(recs.map((r) => [r.domain, r.name]).sort()).toEqual([["brixhamcollege.co.uk", "Brixham College"], ["pycon.org", "PyCon India"]]);
  });

  it("an admin can upload (checked by its bytes), fetch again, and remove a logo; the directory finds those still missing", async () => {
    __setCompanyStore(undefined);
    const store = companyStore();
    await store.upsert([{ domain: "brixhamcollege.co.uk", name: "Brixham College", nameKey: "brixham college", sources: ["g"], firstSeenAt: "2026-11-01", lastSeenAt: "2026-11-01" }]);
    expect((await companyDirectory("", 10, 0, store, { missingLogo: true })).missingLogos).toBe(1);

    expect((await adminLogo("brixhamcollege.co.uk", { kind: "upload", type: "image/png", base64: Buffer.from("<svg onload=alert(1)>").toString("base64") }, Date.now(), fetch, store)).ok).toBe(false);
    expect((await adminLogo("brixhamcollege.co.uk", { kind: "upload", type: "image/jpeg", base64: PNG }, Date.now(), fetch, store)).ok).toBe(false);
    expect((await adminLogo("brixhamcollege.co.uk", { kind: "upload", type: "image/png", base64: PNG }, Date.now(), fetch, store)).ok).toBe(true);
    const d = await companyDirectory("", 10, 0, store);
    expect(d.companies[0].hasLogo).toBe(true);
    expect(d.missingLogos).toBe(0);

    const noIcon = (async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await adminLogo("brixhamcollege.co.uk", { kind: "refetch" }, Date.now(), noIcon, store)).ok).toBe(false);
    expect((await companyDirectory("", 10, 0, store)).companies[0].hasLogo).toBe(true);

    expect((await adminLogo("brixhamcollege.co.uk", { kind: "clear" }, Date.now(), fetch, store)).ok).toBe(true);
    expect((await companyDirectory("", 10, 0, store)).missingLogos).toBe(1);
    expect((await adminLogo("nowhere.example.org", { kind: "clear" }, Date.now(), fetch, store)).ok).toBe(false);
  });
});

describe("fetch all missing logos", () => {
  it("looks again for every company without a logo, even ones looked for recently, once per press, and says what's left", async () => {
    const store = new __MemoryCompanies();
    const rec = (domain: string) => ({ domain, name: domain, nameKey: domain, sources: ["g"], firstSeenAt: "2026-11-01", lastSeenAt: "2026-11-01" });
    await store.upsert([rec("has-icon.org"), rec("no-icon.org"), rec("kept.org")]);
    await store.replaceLogo("kept.org", { data: PNG, type: "image/png", from: "x" }, new Date().toISOString());
    // Looked for an hour ago with nothing found: the daily refresh would wait a month; the button doesn't.
    await store.setLogo("has-icon.org", null, new Date(Date.now() - 3_600_000).toISOString());
    const png = Buffer.from(PNG, "base64");
    const big = Buffer.concat([png, Buffer.alloc(400, 1)]);
    const fetcher = vi.fn(async (url: string) => (String(url).includes("has-icon.org") ? new Response(big, { status: 200, headers: { "content-type": "image/png" } }) : new Response(null, { status: 404 })));
    const since = new Date().toISOString();
    const r = await fetchMissingLogos(since, { store, fetcher: fetcher as unknown as typeof fetch });
    expect(r).toMatchObject({ checked: 2, found: 1, remaining: 0, missing: 1 });
    expect(fetcher.mock.calls.some((c) => String(c[0]).includes("kept.org"))).toBe(false);
    // A second pass from the same press tries nothing again.
    fetcher.mockClear();
    expect(await fetchMissingLogos(since, { store, fetcher: fetcher as unknown as typeof fetch })).toMatchObject({ checked: 0, remaining: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
