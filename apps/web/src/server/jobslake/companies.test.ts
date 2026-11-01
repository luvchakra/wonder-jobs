import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDomain, companyKey, employerDomainOf } from "@/domain/jobslake/companies";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryCompanies, __setCompanyStore, adminLogo, companiesFrom, companyLogo, LOGO_TTL_MS, recordCompanies } from "./companies";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(400).fill(1)]);
const opp = (name: string, domain: string | undefined, applyUrl: string, employerSite = true, sourceId = "greenhouse") =>
  ({ employer: { name, domain }, canonicalApplyUrl: applyUrl, applyPath: employerSite ? "employer_site" : "platform", quality: { employerVerified: employerSite }, sourceRecords: [{ sourceId }] }) as unknown as CanonicalOpportunity;

let store: InstanceType<typeof __MemoryCompanies>;
beforeEach(() => {
  store = new __MemoryCompanies();
  __setCompanyStore(store);
});
afterEach(() => __setCompanyStore(undefined));

describe("company identity — reported, never guessed", () => {
  it("takes a domain only from a source or the employer's own apply link", () => {
    expect(cleanDomain("https://www.IBM.com/careers")).toBe("ibm.com");
    expect(cleanDomain("careers.simeio.co.in")).toBe("simeio.co.in");
    expect(cleanDomain("10.0.0.1")).toBeUndefined();
    expect(cleanDomain("localhost")).toBeUndefined();
    expect(employerDomainOf("https://careers.acme.com/jobs/1", true)).toBe("acme.com");
    expect(employerDomainOf("https://boards.greenhouse.io/acme/jobs/1", true)).toBeUndefined();
    expect(employerDomainOf("https://acme.wd1.myworkdayjobs.com/x", true)).toBeUndefined();
    expect(employerDomainOf("https://in.linkedin.com/jobs/view/1", true)).toBeUndefined();
    expect(employerDomainOf("https://acme.icims.com/jobs/1", true)).toBeUndefined();
    expect(employerDomainOf("https://careers.acme.com/jobs/1", false)).toBeUndefined();
  });

  it("matches company names across sources", () => {
    expect(companyKey("Simeio Solutions Pvt. Ltd.")).toBe(companyKey("Simeio Solutions"));
    expect(companyKey("AT&T Inc.")).toBe("at and t");
  });

  it("records each company once per domain, with every source that reported it", async () => {
    await recordCompanies([opp("IBM", "ibm.com", "https://adzuna.in/x", false, "theirstack"), opp("IBM India", "https://www.ibm.com", "https://x", false, "greenhouse"), opp("Acme", undefined, "https://careers.acme.com/1"), opp("NoSite", undefined, "https://in.indeed.com/1", false)]);
    expect(store.rows.get("ibm.com")).toMatchObject({ name: "IBM India", sources: ["theirstack", "greenhouse"] });
    expect(store.rows.get("acme.com")).toMatchObject({ nameKey: "acme" });
    expect(store.rows.size).toBe(2);
    expect(companiesFrom([opp("", "x.com", "https://x.com")])).toEqual([]);
  });
});

describe("logos — fetched once, cached, only for known companies", () => {
  it("finds a known company by domain or by name, fetches its logo once, and serves the cache after, never refetching a stored one", async () => {
    await recordCompanies([opp("IBM", "ibm.com", "https://x", false)]);
    const fetcher = vi.fn(async () => new Response(PNG, { status: 200 }));
    const first = await companyLogo({ name: "IBM Corporation" }, Date.now(), fetcher as unknown as typeof fetch);
    expect(first?.type).toBe("image/png");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain(encodeURIComponent("https://ibm.com"));
    await companyLogo({ domain: "ibm.com" }, Date.now(), fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await companyLogo({ domain: "ibm.com" }, Date.now() + LOGO_TTL_MS + 1, fetcher as unknown as typeof fetch);
    // A stored logo is never looked for again, however old.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never fetches for a company WorksLake hasn't recorded", async () => {
    const fetcher = vi.fn();
    expect(await companyLogo({ domain: "evil.example.com", name: "Nobody" }, Date.now(), fetcher as unknown as typeof fetch)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses anything that isn't a bitmap image (an SVG could carry script), and remembers there's no logo", async () => {
    await recordCompanies([opp("Acme", "acme.com", "https://x", false)]);
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>${" ".repeat(300)}</svg>`);
    const fetcher = vi.fn(async (url: string) => (url.includes("google") ? new Response(null, { status: 404 }) : new Response(svg, { status: 200 })));
    expect(await companyLogo({ domain: "acme.com" }, Date.now(), fetcher as unknown as typeof fetch)).toBeNull();
    expect(store.rows.get("acme.com")?.logo).toBeNull();
    expect(await companyLogo({ domain: "acme.com" }, Date.now(), fetcher as unknown as typeof fetch)).toBeNull();
    // Every place once (Google ×2, DuckDuckGo, four site files, the home page), and nothing on the second ask.
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
});

describe("icons a home page declares", () => {
  it("keeps only the company's own site, touch icons and larger sizes first", async () => {
    const { iconLinks } = await import("./companies");
    const html = `<link rel="icon" href="/f.png" sizes="32x32"><link rel="apple-touch-icon" href="/t.png" sizes="180x180"><link rel="icon" href="https://evil.example/x.png"><link rel="icon" href="http://169.254.169.254/x.png"><link rel="stylesheet" href="/a.css">`;
    expect(iconLinks(html, "https://www.acme.com/", "acme.com")).toEqual(["https://www.acme.com/t.png", "https://www.acme.com/f.png"]);
  });
});

describe("logos served to every module's cards", () => {
  it("reads only the logo columns, then serves a page of cards from memory, and forgets a logo an admin changes", async () => {
    await recordCompanies([opp("IBM", "ibm.com", "https://x", false)]);
    const fetcher = vi.fn(async () => new Response(PNG, { status: 200 }));
    await companyLogo({ domain: "ibm.com" }, Date.now(), fetcher as unknown as typeof fetch);
    const reads = vi.spyOn(store, "logoFor");
    const full = vi.spyOn(store, "byDomain");
    for (let i = 0; i < 20; i++) expect((await companyLogo({ domain: "https://www.ibm.com/careers", name: "IBM" }, Date.now(), fetcher as unknown as typeof fetch))?.type).toBe("image/png");
    expect(reads).not.toHaveBeenCalled();
    expect(full).not.toHaveBeenCalled();
    await adminLogo("ibm.com", { kind: "clear" }, Date.now(), fetcher as unknown as typeof fetch, store);
    expect(await companyLogo({ domain: "ibm.com" }, Date.now(), fetcher as unknown as typeof fetch)).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
  });
});

describe("where logos are looked for", () => {
  it("finds a site only on www, skips a host that didn't answer, and uses the company's Commons logo last", async () => {
    const { fetchLogo } = await import("./companies");
    const png = new Response(PNG, { status: 200 });
    const calls: string[] = [];
    // Google and DuckDuckGo have none; the bare host doesn't answer; www has /favicon.ico.
    const fetcher = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith("https://acme.org/")) throw new Error("ENOTFOUND");
      if (url === "https://www.acme.org/favicon.ico") return png;
      return new Response(null, { status: 404 });
    });
    expect((await fetchLogo("acme.org", fetcher as unknown as typeof fetch))?.from).toBe("www.acme.org");
    expect(calls.filter((u) => u.startsWith("https://acme.org/"))).toHaveLength(1);

    const wiki = vi.fn(async (url: string) =>
      url.includes("wikidata.org") ? Response.json({ claims: { P154: [{ mainsnak: { datavalue: { value: "Acme logo.svg" } } }] } }) : url.includes("commons.wikimedia.org") ? new Response(PNG, { status: 200 }) : new Response(null, { status: 404 }),
    );
    const logo = await fetchLogo("acme.com", wiki as unknown as typeof fetch, { wikidataId: "Q42" });
    expect(logo?.type).toBe("image/png");
    expect(String(wiki.mock.calls.at(-1)?.[0])).toContain("Special:FilePath/Acme%20logo.svg?width=128");
    // A malformed id is never sent anywhere.
    const none = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await fetchLogo("acme.net", none as unknown as typeof fetch, { wikidataId: "Q1&x=y" })).toBeNull();
    expect(none.mock.calls.some((c) => String((c as unknown[])[0]).includes("wikidata"))).toBe(false);
  });

  it("never records a job board's domain as an employer's", async () => {
    const { companyDomain } = await import("@/domain/jobslake/companies");
    expect(companyDomain("seek.com")).toBeUndefined();
    expect(companyDomain("https://www.seek.com.au/job/1")).toBeUndefined();
    expect(companyDomain("tiaa.org")).toBe("tiaa.org");
  });
});
