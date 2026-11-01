import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { CATEGORIES, laneOf, readProTags, termsFromPro, wedmegoodVendorOf } from "@/modules/services/domain";
import { fetchWedMeGoodVendors, rawFromWedMeGood, runServicesSource, SERVICES_SOURCES, WEDMEGOOD, WEDMEGOOD_GATEWAY_NAME } from "./sources";

const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const listing = (id: string, title: string, breadcrumb: string | undefined, attributes: GatewayListing["attributes"] = {}, over: Partial<GatewayListing> = {}): GatewayListing =>
  ({ id, module: "services", sourceId: "src_wmg", sourceName: WEDMEGOOD_GATEWAY_NAME, title, organization: title, location: "Bandra, Mumbai", description: "", canonicalUrl: `https://www.wedmegood.com/profile/${id}-1`, status: "active", attributes: { ...(breadcrumb ? { breadcrumb } : {}), ...attributes }, ...over }) as unknown as GatewayListing;

beforeEach(() => {
  gateway.calls.length = 0;
  gateway.configured = true;
  gateway.rows = [];
});

describe("a WedMeGood vendor as a listing", () => {
  it("is a wedding and event service at the client's place, with the trade and city from its breadcrumb and only what its profile states", () => {
    const raw = rawFromWedMeGood(listing("The-Makeovers", "The Makeovers", "Vendors > Bridal Makeup Artists > Bridal Makeup Artists Mumbai", { rating: 5, reviews: 4, telephone: "+91 98000 11111", street: "1 Road" }))!;
    expect(raw).toMatchObject({ title: "The Makeovers", company: "The Makeovers", location: "Mumbai", city: "Mumbai", applyUrl: "https://www.wedmegood.com/profile/The-Makeovers-1", employerSite: false });
    expect(JSON.stringify(raw)).not.toMatch(/98000|1 Road/);
    const facts = readProTags(raw.tags!);
    expect(facts).toEqual({ cat: "Wedding & events", city: "Mumbai", skills: ["Bridal Makeup Artists"], rating: 5, reviews: 4 });
    expect(termsFromPro(facts)).toEqual({ lane: "local", currency: "INR", category: "Wedding & events", areas: ["Mumbai"], skills: ["Bridal Makeup Artists"], rating: 5, reviews: 4 });
  });

  it("is its own trade in the local lane; only vendors hired for a service count, not shops, jewellery, cards or venues", () => {
    expect(CATEGORIES).toContain("Wedding & events");
    expect(laneOf("Wedding & events")).toBe("local");
    for (const t of ["Wedding Photographers", "Bridal Makeup Artists", "Wedding Decorators", "Wedding Catering", "Mehendi Artists", "Wedding Planners ", "DJs", "Sangeet Choreographers", "Wedding Pandits & Priests", "Bartenders", "Pre Wedding Shoot"])
      expect(wedmegoodVendorOf(`Vendors > ${t} > ${t} Pune`), t).toMatchObject({ city: "Pune" });
    for (const t of ["Bridal Wear", "Groom Wear", "Wedding Jewellery", "Wedding Cards", "Wedding Cakes", "Wedding Favors", "Wedding Accessories", "Wedding Venues"]) expect(wedmegoodVendorOf(`Vendors > ${t} > ${t} Pune`), t).toBeUndefined();
    expect(wedmegoodVendorOf("Home > Bridal Makeup Artists")).toBeUndefined();
    expect(wedmegoodVendorOf("")).toBeUndefined();
    expect(rawFromWedMeGood(listing("x", "Frontier Bazar", "Vendors > Bridal Wear > Bridal Wear Delhi NCR"))).toBeNull();
    expect(rawFromWedMeGood(listing("x", "No trail", undefined))).toBeNull();
    expect(rawFromWedMeGood(listing("x", "", "Vendors > DJs > DJs Pune"))).toBeNull();
  });

  it("takes the city from the trail, and a trade with no city still lists, under the page's own town", () => {
    expect(wedmegoodVendorOf("Vendors > Wedding Planners  > Wedding Planners  Mumbai")).toEqual({ trade: "Wedding Planners", city: "Mumbai" });
    expect(wedmegoodVendorOf("Vendors > DJs")).toEqual({ trade: "DJs" });
    expect(rawFromWedMeGood(listing("x", "DJ Ash", "Vendors > DJs", {}, { location: "Satellite, Ahmedabad" }))).toMatchObject({ city: "Ahmedabad" });
  });

  it("shows a rating only when WedMeGood gave a sensible one", () => {
    const f = (a: GatewayListing["attributes"]) => readProTags(rawFromWedMeGood(listing("x", "B", "Vendors > DJs > DJs Pune", a))!.tags!);
    expect(f({ rating: 4.5, reviews: 9 })).toMatchObject({ rating: 4.5, reviews: 9 });
    expect(f({ rating: 9 }).rating).toBeUndefined();
    expect(f({ rating: 0, reviews: 0 })).toEqual({ cat: "Wedding & events", city: "Pune", skills: ["DJs"] });
  });
});

describe("reading what the gateway collected from WedMeGood", () => {
  it("answers the client's words and city, from this source only, once each, and never calls WedMeGood", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    gateway.rows = [
      listing("a", "Pune Clicks", "Vendors > Wedding Photographers > Wedding Photographers Pune"),
      listing("b", "Delhi Clicks", "Vendors > Wedding Photographers > Wedding Photographers Delhi NCR"),
      listing("c", "Not WedMeGood", "Vendors > DJs > DJs Pune", {}, { sourceName: "Houzz (houzz.in)" }),
      listing("a", "Pune Clicks (repeat)", "Vendors > Wedding Photographers > Wedding Photographers Pune"),
    ];
    expect((await fetchWedMeGoodVendors({ query: "photographer", locations: ["Pune"] }, needsSetup)).map((j) => j.company)).toEqual(["Pune Clicks"]);
    expect(gateway.calls[0]).toMatchObject({ query: "photographer", limit: 100, offset: 0 });
    expect((await fetchWedMeGoodVendors({ query: "photographer", locations: [] }, needsSetup)).map((j) => j.company).sort()).toEqual(["Delhi Clicks", "Pune Clicks"]);
    expect(fetched).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("is Needs setup where the gateway isn't configured", async () => {
    gateway.configured = false;
    await expect(runServicesSource(SERVICES_SOURCES.find((s) => s.id === WEDMEGOOD)!, { query: "photographer", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("WedMeGood vendors") });
  });
});

describe("the WedMeGood definition files", () => {
  const dir = join(__dirname, "../../../../data-gateway/sources");
  const files = () => readdirSync(dir).filter((f) => /^wedmegood-.+\.json$/.test(f)).sort();

  it("are four sitemap crawls, one per vendor-profile sitemap, accepted by the gateway's validator as public business listings, polite and with terms pending", async () => {
    expect(files()).toHaveLength(4);
    const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => unknown };
    for (const [i, f] of files().entries()) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(() => validateSource(d), f).not.toThrow();
      expect(d).toMatchObject({ kind: "crawl", discover: "sitemap", modules: ["services"], publicBusinesses: true, attribution: WEDMEGOOD_GATEWAY_NAME, externalRedistributionAllowed: false, pathPrefix: "/profile/", pathPattern: "/profile/*", sitemap: `https://www.wedmegood.com/sitemaps/sitemap-vendor-profile-${i + 1}.xml` });
      expect(d.consentVerified).toBeUndefined();
      expect(d.permissionEvidence).toMatch(/^terms pending:/);
      expect(d.permissionEvidence.length).toBeLessThan(500);
      expect(d.crawlDelayMs).toBeGreaterThanOrEqual(2000);
      expect(d.maxPagesPerRun).toBeLessThanOrEqual(20);
      expect(d.minIntervalMinutes).toBeGreaterThanOrEqual(60);
    }
  });

  it("read vendor profiles only: never a review page (robots disallows them), a venue, the blog or a search", async () => {
    const { crawlTargets } = (await import("../../../../data-gateway/src/crawl.mjs")) as unknown as { crawlTargets: (u: string[], s: unknown, r: unknown) => string[] };
    const d = JSON.parse(readFileSync(join(dir, "wedmegood-vendors-1.json"), "utf8"));
    const urls = [
      "https://www.wedmegood.com/profile/Frontier-Bazar-82",
      "https://www.wedmegood.com/profile/Frontier-Bazar-82/reviews/12",
      "https://www.wedmegood.com/wedding-venues/Meera-Banquets-42428",
      "https://www.wedmegood.com/blog/post",
      "https://www.wedmegood.com/search?q=x",
      "https://evil.example/profile/X-1",
    ];
    expect(crawlTargets(urls, d, [])).toEqual(["https://www.wedmegood.com/profile/Frontier-Bazar-82"]);
  });
});
