import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const gateway = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], configured: true, rows: [] as unknown[] }));
vi.mock("@/server/gateway/listings", () => ({
  gatewayListings: vi.fn(async (_module: string, input: Record<string, unknown>) => {
    gateway.calls.push(input);
    const offset = (input.offset as number) ?? 0;
    return { configured: gateway.configured, results: gateway.rows.slice(offset, offset + ((input.limit as number) ?? 50)), sources: [] };
  }),
}));

import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { CATEGORIES, houzzCategoryOf, laneOf, readProTags, termsFromPro } from "@/modules/services/domain";
import { fetchHouzzProfessionals, HOUZZ, HOUZZ_GATEWAY_NAME, rawFromHouzz, runServicesSource, SERVICES_SOURCES } from "./sources";
import { outside } from "./search";

const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const URL_ = (cat: string, slug: string, id: number) => `https://www.houzz.in/professionals/${cat}/${slug}-pfvwin-pf~${id}`;
const listing = (id: string, title: string, url: string, attributes: GatewayListing["attributes"] = {}, over: Partial<GatewayListing> = {}): GatewayListing => ({ id, module: "services", sourceId: "src_houzz", sourceName: HOUZZ_GATEWAY_NAME, sourceMethod: "crawl", title, organization: title, location: "Bengaluru, Karnataka", description: "An interior design and execution firm based in Bangalore.", canonicalUrl: url, publishedAt: null, observedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-22T00:00:00Z", remote: false, attributes, status: "active", ...over });

beforeEach(() => {
  gateway.calls.length = 0;
  gateway.configured = true;
  gateway.rows = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("a Houzz professional as a listing", () => {
  it("is a design, build and renovation business at the client's place, with only what its own profile states", () => {
    const raw = rawFromHouzz(listing("services_1", "De Panache", URL_("interior-designers-and-decorators", "de-panache", 1326136504), { rating: 5, reviews: 161, website: "https://depanache.in", services: "3D Rendering, Interior Design, Kitchen Design", lat: 12.9269, lon: 77.6347, telephone: "096201 31348", streetAddress: "No-45, 7th Cross", postalCode: "560034" }))!;
    expect(raw).toMatchObject({ title: "De Panache", company: "De Panache", location: "Bengaluru", city: "Bengaluru", applyUrl: URL_("interior-designers-and-decorators", "de-panache", 1326136504), employerSite: false });
    // No phone, street or postcode travels, even if the gateway kept one.
    expect(JSON.stringify(raw)).not.toMatch(/096201|7th Cross|560034/);
    const facts = readProTags(raw.tags!);
    expect(facts).toEqual({ cat: "Design, build & renovation", city: "Bengaluru", web: "https://depanache.in", skills: ["3D Rendering", "Interior Design", "Kitchen Design"], rating: 5, reviews: 161 });
    expect(termsFromPro(facts)).toEqual({ lane: "local", currency: "INR", category: "Design, build & renovation", areas: ["Bengaluru"], skills: ["3D Rendering", "Interior Design", "Kitchen Design"], rating: 5, reviews: 161 });
  });

  it("is its own trade in the local lane, and only Houzz's service categories count: photographers and furniture shops are left out", () => {
    expect(CATEGORIES).toContain("Design, build & renovation");
    expect(laneOf("Design, build & renovation")).toBe("local");
    expect(houzzCategoryOf(URL_("architects-and-building-designers", "a", 1))).toBe("Design, build & renovation");
    expect(houzzCategoryOf(URL_("specialty-contractors", "a", 1))).toBe("Design, build & renovation");
    expect(houzzCategoryOf(URL_("photographers", "a", 1))).toBeUndefined();
    expect(houzzCategoryOf(URL_("furniture-and-accessories", "a", 1))).toBeUndefined();
    expect(houzzCategoryOf("https://evil.example/professionals/construction/a-pf~1")).toBeUndefined();
    expect(houzzCategoryOf("https://www.houzz.in/professionals/construction/probr0-bo~t_26732")).toBeUndefined();
    expect(rawFromHouzz(listing("x", "A Photographer", URL_("photographers", "a", 2)))).toBeNull();
    expect(rawFromHouzz(listing("x", "", URL_("construction", "a", 3)))).toBeNull();
  });

  it("shows a rating only when Houzz gave a sensible one, and links a website only if it is https", () => {
    const f = (a: GatewayListing["attributes"]) => readProTags(rawFromHouzz(listing("x", "B", URL_("construction", "b", 4), a))!.tags!);
    expect(f({ rating: 4.8, reviews: 12 })).toMatchObject({ rating: 4.8, reviews: 12 });
    expect(f({ rating: 9, reviews: 12 }).rating).toBeUndefined();
    expect(f({ rating: 0 }).rating).toBeUndefined();
    expect(f({ website: "http://plain.example" }).web).toBeUndefined();
    expect(f({ website: "javascript:alert(1)" }).web).toBeUndefined();
    expect(f({})).toEqual({ cat: "Design, build & renovation", city: "Bengaluru" });
  });

  it("the card links the business's own website when it has one, else its Houzz profile, with no OpenStreetMap credit", () => {
    const o = (web?: string) => ({ id: "services:h", title: "De Panache", employer: { name: "De Panache" }, locations: ["Bengaluru"], workplaceType: "onsite", enrichment: { tags: ["cat:Design, build & renovation", "city:Bengaluru", "rating:5", "reviews:161", ...(web ? [`web:${web}`] : [])] }, description: "x", canonicalApplyUrl: "https://www.houzz.in/professionals/construction/de-panache-pf~1", sourceRecords: [{ sourceId: HOUZZ, sourceName: "Houzz professionals", canonical: true }] }) as unknown as Parameters<typeof outside>[0];
    expect(outside(o("https://depanache.in"))).toMatchObject({ applyUrl: "https://depanache.in", sourceName: "Houzz professionals", terms: { lane: "local", rating: 5, reviews: 161 } });
    expect(outside(o()).applyUrl).toBe("https://www.houzz.in/professionals/construction/de-panache-pf~1");
    expect(outside(o()).attribution).toBeUndefined();
  });
});

describe("reading what the gateway collected from Houzz", () => {
  it("answers the client's words and city, from this source only, once each, and never calls Houzz", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    gateway.rows = [
      listing("a", "Bengaluru Interiors", URL_("interior-designers-and-decorators", "bi", 1)),
      listing("b", "Pune Builders", URL_("construction", "pb", 2), {}, { location: "Pune, Maharashtra" }),
      listing("c", "Not Houzz", URL_("construction", "nh", 3), {}, { sourceName: "OpenStreetMap contributors (ODbL)" }),
      listing("a", "Bengaluru Interiors (repeat)", URL_("interior-designers-and-decorators", "bi", 1)),
    ];
    expect((await fetchHouzzProfessionals({ query: "interior designer", locations: ["Bengaluru"] }, needsSetup)).map((j) => j.company)).toEqual(["Bengaluru Interiors"]);
    expect(gateway.calls[0]).toMatchObject({ query: "interior designer", limit: 100, offset: 0 });
    expect((await fetchHouzzProfessionals({ query: "builder", locations: [] }, needsSetup)).map((j) => j.company).sort()).toEqual(["Bengaluru Interiors", "Pune Builders"]);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("is Needs setup where the gateway isn't configured", async () => {
    gateway.configured = false;
    await expect(runServicesSource(SERVICES_SOURCES.find((s) => s.id === HOUZZ)!, { query: "interior", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("Houzz professionals") });
  });
});

describe("the Houzz definition files", () => {
  const dir = join(__dirname, "../../../../data-gateway/sources");
  const files = () => readdirSync(dir).filter((f) => /^houzz-.+\.json$/.test(f)).sort();

  it("are ten crawl sources, one per Houzz service category, accepted by the gateway's own validator as public business listings", async () => {
    expect(files()).toHaveLength(10);
    const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => unknown };
    for (const f of files()) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(() => validateSource(d), f).not.toThrow();
      expect(d).toMatchObject({ kind: "crawl", discover: "links", modules: ["services"], publicBusinesses: true, attribution: HOUZZ_GATEWAY_NAME, externalRedistributionAllowed: false, pathPrefix: "/professionals/" });
      expect(d.consentVerified).toBeUndefined();
      // Terms are recorded as pending, never cleared; and the evidence fits what the gateway keeps (500 characters).
      expect(d.permissionEvidence).toMatch(/^terms pending:/);
      expect(d.permissionEvidence.length).toBeLessThan(500);
      // Polite: a delay, a bounded run, a daily interval; 15 profiles a page over 16 pages.
      expect(d.crawlDelayMs).toBeGreaterThanOrEqual(2000);
      expect(d.maxPagesPerRun).toBeLessThanOrEqual(40);
      expect(d.minIntervalMinutes).toBeGreaterThanOrEqual(1440);
      expect(d.extraUrls).toHaveLength(15);
      for (const u of [d.url, ...d.extraUrls]) expect(new URL(u).hostname).toBe("www.houzz.in");
      expect(new Set(d.extraUrls.map((u: string) => new URL(u).searchParams.get("fi")))).toEqual(new Set(["15", "30", "45", "60", "75", "90", "105", "120", "135", "150", "165", "180", "195", "210", "225"]));
    }
  });

  it("read a listing page's profiles and nothing else: not the navigation, other categories or pagination it also links", async () => {
    const { pageLinks, crawlTargets } = (await import("../../../../data-gateway/src/crawl.mjs")) as unknown as { pageLinks: (h: string, b: string) => string[]; crawlTargets: (u: string[], s: unknown, r: unknown) => string[] };
    const d = JSON.parse(readFileSync(join(dir, "houzz-construction.json"), "utf8"));
    const html = [
      '<a href="/professionals/construction/acme-builders-pfvwin-pf~123">Acme</a>',
      '<a href="https://www.houzz.in/professionals/construction/beta-pfvwin-pf~456">Beta</a>',
      '<a href="/professionals/architects#">Architects</a>',
      '<a href="/professionals/probr0-bo~?fi=15">next</a>',
      '<a href="/professionals/construction/probr0-bo~t_26732?fi=30">next</a>',
      '<a href="/professionals/s/query">search</a>',
      '<a href="/photos/kitchen-ideas">photos</a>',
      '<a href="https://evil.example/professionals/construction/x-pf~9">elsewhere</a>',
    ].join("\n");
    const targets = crawlTargets(pageLinks(html, d.url), d, []);
    expect(targets).toEqual(["https://www.houzz.in/professionals/construction/acme-builders-pfvwin-pf~123", "https://www.houzz.in/professionals/construction/beta-pfvwin-pf~456"]);
  });
});
