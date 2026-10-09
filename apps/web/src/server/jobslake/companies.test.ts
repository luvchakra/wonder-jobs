import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDomain, companyKey, employerDomainOf } from "@/domain/jobslake/companies";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryCompanies, __setCompanyStore, companiesFrom, companyLogo, LOGO_TTL_MS, recordCompanies } from "./companies";

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
  it("finds a known company by domain or by name, fetches its logo once, and serves the cache after", async () => {
    await recordCompanies([opp("IBM", "ibm.com", "https://x", false)]);
    const fetcher = vi.fn(async () => new Response(PNG, { status: 200 }));
    const first = await companyLogo({ name: "IBM Corporation" }, Date.now(), fetcher as unknown as typeof fetch);
    expect(first?.type).toBe("image/png");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("domain=ibm.com");
    await companyLogo({ domain: "ibm.com" }, Date.now(), fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await companyLogo({ domain: "ibm.com" }, Date.now() + LOGO_TTL_MS + 1, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never fetches for a company JobsLake hasn't recorded", async () => {
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
    expect(fetcher).toHaveBeenCalledTimes(2); // both places, once
  });
});
