import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryCompanies, LOGO_TTL_MS } from "./companies";
import { refreshCompanies } from "./companyRefresh";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(400).fill(1)]);
const opp = (name: string, domain: string | undefined, applyUrl = "https://in.indeed.com/1", employerSite = false) =>
  ({ employer: { name, domain }, canonicalApplyUrl: applyUrl, applyPath: employerSite ? "employer_site" : "platform", quality: { employerVerified: employerSite }, sourceRecords: [{ sourceId: "theirstack" }] }) as unknown as CanonicalOpportunity;

describe("JobsLake's daily company refresh", () => {
  it("records every company its postings name a domain for, counts their postings, and fetches missing logos", async () => {
    const store = new __MemoryCompanies();
    const now = Date.parse("2026-10-17T00:00:00Z");
    const fetched: string[] = [];
    const fetcher = (async (url: string) => {
      fetched.push(url);
      return url.includes("ibm.com") ? new Response(PNG, { status: 200 }) : new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const r = await refreshCompanies({
      now,
      store,
      fetcher,
      postings: async () => [opp("IBM", "ibm.com"), opp("IBM", "ibm.com"), opp("Acme", undefined, "https://careers.acme.com/1", true), opp("Name only", undefined)],
    });
    expect(r).toEqual({ postings: 4, companies: 2, logosChecked: 2, logosFound: 1 });
    expect(store.rows.get("ibm.com")).toMatchObject({ openJobs: 2, logo: { type: "image/png" } });
    expect(store.rows.get("acme.com")).toMatchObject({ openJobs: 1, logo: null });
    // A company whose postings name no domain isn't given one.
    expect([...store.rows.keys()].sort()).toEqual(["acme.com", "ibm.com"]);

    // The next day: logos already looked for aren't fetched again until they're a month old.
    fetched.length = 0;
    const again = await refreshCompanies({ now: now + 86_400_000, store, fetcher, postings: async () => [opp("IBM", "ibm.com")] });
    expect(again.logosChecked).toBe(0);
    expect(fetched).toEqual([]);
    expect(store.rows.get("ibm.com")?.openJobs).toBe(1);
    const later = await refreshCompanies({ now: Date.now() + LOGO_TTL_MS + 86_400_000, store, fetcher, postings: async () => [] });
    expect(later.logosChecked).toBe(2);
  });
});
