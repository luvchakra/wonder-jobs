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
import { CITIES, CITY_RADIUS_KM, nearestCity } from "@/wonderworks/find/cities";
import { craftsFor, OSM_ATTRIBUTION, readProTags, termsFromPro } from "@/modules/services/domain";
import { fetchOsmBusinesses, OSM_GATEWAY_NAME, OPENSTREETMAP, rawFromOsm, runServicesSource, SERVICES_SOURCES } from "./sources";
import { outside } from "./search";

const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const listing = (id: string, title: string, attributes: GatewayListing["attributes"], over: Partial<GatewayListing> = {}): GatewayListing => ({ id, module: "services", sourceId: "src_osm", sourceName: OSM_GATEWAY_NAME, sourceMethod: "json_api", title, organization: title, location: "", description: String(attributes.craft ?? ""), canonicalUrl: `https://www.openstreetmap.org/${id}`, publishedAt: null, observedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-22T00:00:00Z", remote: false, attributes, status: "active", ...over });
const PUNE = { lat: 18.5204, lon: 73.8567 };

beforeEach(() => {
  gateway.calls.length = 0;
  gateway.configured = true;
  gateway.rows = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("an OpenStreetMap business as a listing", () => {
  it("keeps what OSM has about a named business with a known trade, and nothing about the person: no phone, no email", () => {
    const raw = rawFromOsm(listing("way/42", "Sharma Plumbing Works", { craft: "plumber", clat: PUNE.lat + 0.01, clon: PUNE.lon, suburb: "Kothrud", website: "https://sharma-plumbing.example.in", phone: "+919876543210", email: "ravi@example.in" }))!;
    expect(raw).toMatchObject({ title: "Sharma Plumbing Works", company: "Sharma Plumbing Works", location: "Pune", city: "Pune", applyUrl: "https://www.openstreetmap.org/way/42", employerSite: false });
    expect(raw.description).toBe("Plumbing in Kothrud, Pune. Listed on OpenStreetMap.");
    expect(JSON.stringify(raw)).not.toMatch(/9876543210|ravi@example/);
    const facts = readProTags(raw.tags!);
    expect(facts).toEqual({ craft: "plumber", city: "Pune", web: "https://sharma-plumbing.example.in" });
    // Local work in its city, with no price, rating or warranty stated.
    expect(termsFromPro(facts)).toEqual({ lane: "local", currency: "INR", category: "Plumbing", areas: ["Pune"] });
  });

  it("is businesses only: no name, an unknown trade or a website that isn't https is left out or not linked", () => {
    expect(rawFromOsm(listing("node/1", "", { craft: "plumber" }))).toBeNull();
    expect(rawFromOsm(listing("node/2", "Gupta Ji", { craft: "gardener" }))).toBeNull();
    expect(readProTags(rawFromOsm(listing("node/3", "A", { craft: "hvac", lat: PUNE.lat, lon: PUNE.lon, website: "javascript:alert(1)" }))!.tags!).web).toBeUndefined();
    expect(readProTags(rawFromOsm(listing("node/4", "B", { craft: "hvac", lat: PUNE.lat, lon: PUNE.lon, website: "http://plain.example" }))!.tags!).web).toBeUndefined();
  });

  it("the card gets the credit, the business's own website, and a derived area; OpenStreetMap's page when it has no website", () => {
    const o = (web?: string) => ({ id: "services:x", title: "Sharma Plumbing Works", employer: { name: "Sharma Plumbing Works" }, locations: ["Pune"], workplaceType: "onsite", enrichment: { tags: ["craft:plumber", "city:Pune", ...(web ? [`web:${web}`] : [])] }, description: "Plumbing in Pune.", canonicalApplyUrl: "https://www.openstreetmap.org/way/42", sourceRecords: [{ sourceId: OPENSTREETMAP, sourceName: "OpenStreetMap", canonical: true }] }) as unknown as Parameters<typeof outside>[0];
    expect(outside(o("https://sharma-plumbing.example.in"))).toMatchObject({ attribution: OSM_ATTRIBUTION, applyUrl: "https://sharma-plumbing.example.in", terms: { lane: "local", category: "Plumbing", areas: ["Pune"] } });
    expect(outside(o())).toMatchObject({ attribution: "© OpenStreetMap contributors", applyUrl: "https://www.openstreetmap.org/way/42" });
    // A source that isn't OpenStreetMap carries no OpenStreetMap credit.
    const other = o();
    (other as unknown as { sourceRecords: { sourceId: string }[] }).sourceRecords[0].sourceId = "svc_freelancer";
    expect(outside(other).attribution).toBeUndefined();
  });
});

describe("reading what the gateway collected", () => {
  const rows = () => [
    listing("node/1", "CoolAir Pune", { craft: "hvac", lat: 18.53, lon: 73.85 }),
    listing("node/2", "Mumbai Cooling", { craft: "hvac", lat: 19.08, lon: 72.88 }),
    listing("node/3", "Somewhere Else AC", { craft: "hvac", lat: 25.0, lon: 70.0 }),
    listing("node/4", "Not Ours", { craft: "hvac", lat: 18.53, lon: 73.85 }, { sourceName: "Some other gateway source" }),
    listing("node/1", "CoolAir Pune (again)", { craft: "hvac", lat: 18.53, lon: 73.85 }),
  ];

  it("asks by the trade the client's words mean, answers the client's city by each business's nearest city, and never calls Overpass", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    gateway.rows = rows();
    const jobs = await fetchOsmBusinesses({ query: "AC repair", locations: ["Pune"] }, needsSetup);
    expect(gateway.calls[0]).toMatchObject({ query: "hvac", limit: 100, offset: 0 });
    expect(jobs.map((j) => j.company)).toEqual(["CoolAir Pune"]);
    expect(fetched).not.toHaveBeenCalled();
    // No place asked: every collected business of that trade (those in a city, from this gateway source, once each).
    expect((await fetchOsmBusinesses({ query: "ac", locations: [] }, needsSetup)).map((j) => j.company).sort()).toEqual(["CoolAir Pune", "Mumbai Cooling", "Somewhere Else AC"]);
  });

  it("pages through a trade a hundred at a time, and stops at a short page", async () => {
    gateway.rows = Array.from({ length: 230 }, (_, i) => listing(`node/${i}`, `Plumber ${i}`, { craft: "plumber", lat: PUNE.lat, lon: PUNE.lon }));
    const jobs = await fetchOsmBusinesses({ query: "plumber", locations: [] }, needsSetup);
    expect(jobs).toHaveLength(230);
    expect(gateway.calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it("is Needs setup where the gateway isn't configured, never an empty answer made to look real", async () => {
    gateway.configured = false;
    await expect(fetchOsmBusinesses({ query: "plumber", locations: ["Pune"] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("data gateway") });
    await expect(runServicesSource(SERVICES_SOURCES.find((s) => s.id === OPENSTREETMAP)!, { query: "plumber", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError" });
  });
});

describe("trades, cities and the definition files", () => {
  it("reads the trade a client's words mean", () => {
    expect(craftsFor("AC repair")).toEqual(["hvac"]);
    expect(craftsFor("plumber in Kothrud")).toEqual(["plumber"]);
    expect(craftsFor("electrician")).toEqual(["electrician"]);
    expect(craftsFor("logo design")).toEqual([]);
  });

  it("gives a business the nearest city within 25 km, and none beyond", () => {
    expect(nearestCity(18.53, 73.85)?.name).toBe("Pune");
    expect(nearestCity(28.66, 77.40)?.name).toBe("Ghaziabad");
    expect(nearestCity(19.0, 72.9)?.name).toBe("Mumbai");
    expect(nearestCity(25.0, 70.0)).toBeUndefined();
    expect(CITY_RADIUS_KM).toBe(25);
  });

  it("the four definition files ask for exactly the cities this table knows, businesses only, with the credit and a weekly interval", async () => {
    const dir = join(__dirname, "../../../../data-gateway/sources");
    const files = readdirSync(dir).filter((f) => /^osm-services-.+\.json$/.test(f));
    expect(files.sort()).toEqual(["osm-services-east.json", "osm-services-north.json", "osm-services-south.json", "osm-services-west.json"]);
    const asked: string[] = [];
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(d).toMatchObject({ kind: "json_api", modules: ["services"], itemsPath: "elements", attribution: OSM_GATEWAY_NAME, publicBusinesses: true, externalRedistributionAllowed: false, minIntervalMinutes: 10080 });
      expect(d.consentVerified).toBeUndefined();
      // The gateway's own check accepts it as public business listings (no opt-in is claimed), and keeps its evidence whole.
      const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => { permissionEvidence: string } };
      const accepted = validateSource(d);
      expect(accepted.permissionEvidence).toBe(d.permissionEvidence);
      expect(d.permissionEvidence.length).toBeLessThan(500);
      expect(d.extraUrls.length + 1).toBeLessThanOrEqual(7);
      // No contact details are mapped.
      expect(JSON.stringify(d.mapping)).not.toMatch(/phone|email|contact/i);
      for (const u of [d.url, ...d.extraUrls]) {
        const url = new URL(u);
        expect(url.hostname).toBe("overpass-api.de");
        const q = decodeURIComponent(url.search.slice(6));
        expect(q).toMatch(/\["name"\]/);
        expect(q).toMatch(/\["craft"~/);
        const m = /around:15000,([\d.]+),([\d.]+)/.exec(q)!;
        const city = CITIES.find((c) => c.lat === Number(m[1]) && c.lon === Number(m[2]));
        expect(city, q).toBeDefined();
        asked.push(city!.name);
      }
    }
    expect(asked.sort()).toEqual(CITIES.map((c) => c.name).sort());
  });
});

describe("more trades from OpenStreetMap", () => {
  it("maps tiling, roofing, glazing, plastering, masonry, photography and catering onto this module's own trades", () => {
    for (const [craft, trade] of [["tiler", "Design, build & renovation"], ["roofer", "Design, build & renovation"], ["glaziery", "Design, build & renovation"], ["plasterer", "Design, build & renovation"], ["stonemason", "Design, build & renovation"], ["photographer", "Wedding & events"], ["caterer", "Wedding & events"]]) {
      const raw = rawFromOsm(listing(`node/${craft}`, `A ${craft}`, { craft, lat: PUNE.lat, lon: PUNE.lon }))!;
      expect(termsFromPro(readProTags(raw.tags!)), craft).toMatchObject({ lane: "local", category: trade, areas: ["Pune"] });
    }
    expect(rawFromOsm(listing("node/g", "Gupta Ji", { craft: "gardener" }))).toBeNull();
  });

  it("finds them from a client's words", () => {
    expect(craftsFor("wedding photographer")).toEqual(["photographer"]);
    expect(craftsFor("caterer for 200 guests")).toEqual(["caterer"]);
    expect(craftsFor("bathroom tiles")).toEqual(["plumber", "tiler"]);
    expect(craftsFor("roof waterproofing")).toEqual(["roofer"]);
  });

  it("are asked in every definition's queries, which stay India-only and carry the country", () => {
    const dir = join(__dirname, "../../../../data-gateway/sources");
    for (const f of readdirSync(dir).filter((x) => /^(osm-services|houzz|wedmegood)-.+\.json$/.test(x))) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(d.geography, f).toEqual(["IN"]);
      if (!f.startsWith("osm-")) continue;
      for (const u of [d.url, ...d.extraUrls]) expect(decodeURIComponent(new URL(u).search.slice(6)), f).toContain("tiler|roofer|glaziery|plasterer|stonemason|photographer|caterer");
    }
  });
});

