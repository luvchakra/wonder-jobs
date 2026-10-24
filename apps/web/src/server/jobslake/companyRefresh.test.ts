import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryCompanies, LOGO_TTL_MS } from "./companies";
import { refreshCompanies } from "./companyRefresh";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(400).fill(1)]);
const opp = (name: string, domain: string | undefined, applyUrl = "https://in.indeed.com/1", employerSite = false) =>
  ({ employer: { name, domain }, canonicalApplyUrl: applyUrl, applyPath: employerSite ? "employer_site" : "platform", quality: { employerVerified: employerSite }, sourceRecords: [{ sourceId: "theirstack" }] }) as unknown as CanonicalOpportunity;

describe("JobsLake's daily company refresh", () => {
  it("gives a company whose postings name no domain its official website from Wikidata, by exact name", async () => {
    const store = new __MemoryCompanies();
    const asked: string[][] = [];
    const websites = async (names: string[]) => {
      asked.push(names);
      return new Map([["morgan stanley", { domain: "morganstanley.com", sourceId: "Q207" }]]);
    };
    const r = await refreshCompanies({ wikidata: async () => new Map(), websites, store, logoLimit: 0, postings: async () => [opp("Morgan Stanley", undefined), opp("Morgan Stanley", undefined), opp("Unknown Co", undefined), opp("IBM", "ibm.com")] });
    expect(r).toMatchObject({ namesWithoutDomain: 2, namesAsked: 2, namesResolved: 1 });
    expect(asked[0]).toEqual(["Morgan Stanley", "Unknown Co"]);
    expect(store.rows.get("morganstanley.com")).toMatchObject({ name: "Morgan Stanley", nameKey: "morgan stanley", openJobs: 2, sources: ["wikidata"] });
    // The name now has a row, so it's found by name (logos, facts, H-1B follow) and isn't asked again.
    expect((await store.byName("morgan stanley"))?.domain).toBe("morganstanley.com");
    const again = await refreshCompanies({ wikidata: async () => new Map(), websites, store, logoLimit: 0, postings: async () => [opp("Morgan Stanley", undefined)] });
    expect(again.namesAsked).toBe(0);
  });

  it("records every company its postings name a domain for, counts their postings, and fetches missing logos", async () => {
    const store = new __MemoryCompanies();
    const now = Date.parse("2026-10-17T00:00:00Z");
    const fetched: string[] = [];
    const fetcher = (async (url: string) => {
      fetched.push(url);
      return url.includes("ibm.com") ? new Response(PNG, { status: 200 }) : new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const r = await refreshCompanies({ wikidata: async () => new Map(), websites: async () => new Map(),
      now,
      store,
      fetcher,
      postings: async () => [opp("IBM", "ibm.com"), opp("IBM", "ibm.com"), opp("Acme", undefined, "https://careers.acme.com/1", true), opp("Name only", undefined)],
    });
    expect(r).toEqual({ postings: 4, companies: 2, logosChecked: 2, logosFound: 1, jobTypesFilled: 0, wikidataChecked: 2, wikidataFound: 0, namesWithoutDomain: 1, namesAsked: 1, namesResolved: 0 });
    expect(store.rows.get("ibm.com")).toMatchObject({ openJobs: 2, logo: { type: "image/png" } });
    expect(store.rows.get("acme.com")).toMatchObject({ openJobs: 1, logo: null });
    // A company whose postings name no domain isn't given one.
    expect([...store.rows.keys()].sort()).toEqual(["acme.com", "ibm.com"]);

    // The next day: logos already looked for aren't fetched again until they're a month old.
    fetched.length = 0;
    const again = await refreshCompanies({ wikidata: async () => new Map(), websites: async () => new Map(), now: now + 86_400_000, store, fetcher, postings: async () => [opp("IBM", "ibm.com")] });
    expect(again.logosChecked).toBe(0);
    expect(fetched).toEqual([]);
    expect(store.rows.get("ibm.com")?.openJobs).toBe(1);
    const later = await refreshCompanies({ wikidata: async () => new Map(), websites: async () => new Map(), now: Date.now() + LOGO_TTL_MS + 86_400_000, store, fetcher, postings: async () => [] });
    expect(later.logosChecked).toBe(2);
  });

  it("gives stored postings the job type their title states — also over a source's Full-time it contradicts — and leaves the rest alone", async () => {
    const titled = (title: string, extra: Partial<CanonicalOpportunity> = {}) => ({ ...opp("Acme", undefined), title, ...extra }) as CanonicalOpportunity;
    const saved: CanonicalOpportunity[] = [];
    const r = await refreshCompanies({ wikidata: async () => new Map(), websites: async () => new Map(),
      store: new __MemoryCompanies(),
      fetcher: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
      postings: async () => [titled("Part-time Barista"), titled("Freelance Illustrator"), titled("Product Manager"), titled("Senior Engineer (Part-time)", { jobType: "full_time", jobTypeFrom: "source" }), titled("Temporary Accommodation Officer", { jobType: "full_time", jobTypeFrom: "source" }), titled("Intern - Sales", { jobType: "contract", jobTypeFrom: "source" })],
      savePostings: async (x) => void saved.push(...x),
    });
    expect(r.jobTypesFilled).toBe(3);
    expect(saved.map((o) => [o.title, o.jobType, o.jobTypeFrom])).toEqual([
      ["Part-time Barista", "part_time", "title"],
      ["Freelance Illustrator", "gig", "title"],
      ["Senior Engineer (Part-time)", "part_time", "title"],
    ]);
  });
});
