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
import { CITIES } from "@/wonderworks/find/cities";
import { OSM_ATTRIBUTION, OSM_GATEWAY_NAME } from "@/wonderworks/find/osm";
import { isPracticeName, practiceKind, readOsmTags, termsFromOsm } from "@/modules/therapists/domain";
import { shareOf } from "@/modules/therapists/share";
import { fetchOsmPractices, OPENSTREETMAP_THERAPISTS, rawFromOsm, runTherapistsSource, THERAPISTS_SOURCES, therapistsSourceAvailable } from "./sources";
import { outside } from "./search";

const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const listing = (id: string, title: string, attributes: GatewayListing["attributes"], over: Partial<GatewayListing> = {}): GatewayListing => ({ id, module: "therapists", sourceId: "src_osm_t", sourceName: OSM_GATEWAY_NAME, sourceMethod: "json_api", title, organization: title, location: "", description: String(attributes.healthcare ?? ""), canonicalUrl: `https://www.openstreetmap.org/${id}`, publishedAt: null, observedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-22T00:00:00Z", remote: false, attributes, status: "active", ...over });
const PUNE = { lat: 18.5204, lon: 73.8567 };

beforeEach(() => {
  gateway.calls.length = 0;
  gateway.configured = true;
  gateway.rows = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("an OpenStreetMap practice as a listing", () => {
  it("keeps what the map has about a named practice, and nothing about a person: no phone, no email, no address, no licence", () => {
    const raw = rawFromOsm(listing("way/42", "Calm Minds Counselling Centre", { healthcare: "counselling", clat: PUNE.lat + 0.01, clon: PUNE.lon, suburb: "Kothrud", website: "https://calmminds.example.in", phone: "+919876543210", email: "asha@example.in", street: "12 Rose Lane" }))!;
    expect(raw).toMatchObject({ title: "Calm Minds Counselling Centre", company: "Calm Minds Counselling Centre", location: "Pune", city: "Pune", applyUrl: "https://www.openstreetmap.org/way/42", employerSite: false });
    expect(raw.description).toBe("Counselling practice in Kothrud, Pune. Listed on OpenStreetMap.");
    expect(JSON.stringify(raw)).not.toMatch(/9876543210|asha@example|Rose Lane/);
    expect(readOsmTags(raw.tags!)).toEqual({ healthcare: "counselling", city: "Pune", web: "https://calmminds.example.in" });
    // In person only, no fee, language or focus stated: nothing is shown that the map doesn't have.
    expect(termsFromOsm()).toEqual({ currency: "INR", modes: ["in_person"] });
  });

  it("is practices only: no name, no practice word (a person's own name), no healthcare or clinic tag, or an https-less website is left out", () => {
    expect(rawFromOsm(listing("node/1", "", { healthcare: "psychologist" }))).toBeNull();
    expect(rawFromOsm(listing("node/2", "Dr. Anita Sharma", { healthcare: "psychotherapist", lat: PUNE.lat, lon: PUNE.lon }))).toBeNull();
    expect(rawFromOsm(listing("node/3", "Anita Sharma", { healthcare: "counselling", lat: PUNE.lat, lon: PUNE.lon }))).toBeNull();
    expect(rawFromOsm(listing("node/4", "Sunrise Clinic", { lat: PUNE.lat, lon: PUNE.lon }))).toBeNull();
    const ok = rawFromOsm(listing("node/5", "Sunrise Mental Health Clinic", { amenity: "clinic", speciality: "psychiatry", lat: PUNE.lat, lon: PUNE.lon, website: "http://plain.example" }))!;
    expect(ok.description).toBe("Clinic in Pune. Listed on OpenStreetMap.");
    expect(readOsmTags(ok.tags!).web).toBeUndefined();
    expect(readOsmTags(rawFromOsm(listing("node/6", "Mind Care Centre", { healthcare: "psychologist", lat: PUNE.lat, lon: PUNE.lon, website: "javascript:alert(1)" }))!.tags!).web).toBeUndefined();
  });

  it("tells a practice's name from a person's", () => {
    for (const n of ["Calm Minds Counselling Centre", "Delhi Psychology Associates", "Sunrise Clinic", "Mann Wellness Studio", "Hope Foundation"]) expect(isPracticeName(n), n).toBe(true);
    for (const n of ["Dr. Anita Sharma", "Anita Sharma", "Rakesh Mehta", "Mr. K. Iyer"]) expect(isPracticeName(n), n).toBe(false);
    expect(practiceKind({ healthcare: "psychotherapist" })).toBe("Psychotherapy practice");
    expect(practiceKind({ amenity: "doctors" })).toBe("Medical practice");
  });

  it("the card gets the credit, the practice's own website, and no fee, language or rating", () => {
    const o = (web?: string) => ({ id: "therapists:x", title: "Calm Minds Counselling Centre", employer: { name: "Calm Minds Counselling Centre" }, locations: ["Pune"], enrichment: { tags: ["hc:counselling", "city:Pune", ...(web ? [`web:${web}`] : [])] }, description: "Counselling practice in Pune. Listed on OpenStreetMap.", canonicalApplyUrl: "https://www.openstreetmap.org/way/42", sourceRecords: [{ sourceId: OPENSTREETMAP_THERAPISTS, sourceName: "OpenStreetMap", canonical: true }] }) as unknown as Parameters<typeof outside>[0];
    expect(outside(o("https://calmminds.example.in"))).toMatchObject({ origin: "outside", attribution: OSM_ATTRIBUTION, applyUrl: "https://calmminds.example.in", terms: { currency: "INR", modes: ["in_person"] }, sourceName: "OpenStreetMap" });
    expect(outside(o())).toMatchObject({ attribution: "© OpenStreetMap contributors", applyUrl: "https://www.openstreetmap.org/way/42" });
    expect(outside(o()).postingId).toBeUndefined();
    expect(outside(o()).terms.feeMin).toBeUndefined();
  });
});

describe("reading what the gateway collected", () => {
  const rows = () => [
    listing("node/1", "Calm Minds Counselling Centre", { healthcare: "counselling", lat: 18.53, lon: 73.85 }),
    listing("node/2", "Mumbai Mind Care Clinic", { healthcare: "psychologist", lat: 19.08, lon: 72.88 }),
    listing("node/3", "Remote Village Clinic", { amenity: "clinic", lat: 25.0, lon: 70.0 }),
    listing("node/4", "Not Ours Clinic", { healthcare: "counselling", lat: 18.53, lon: 73.85 }, { sourceName: "Some other gateway source" }),
    listing("node/5", "Dr. Someone", { healthcare: "psychotherapist", lat: 18.53, lon: 73.85 }),
    listing("node/1", "Calm Minds Counselling Centre (again)", { healthcare: "counselling", lat: 18.53, lon: 73.85 }),
  ];

  it("answers the client's city by each practice's nearest city, from this gateway source only, once each, and never calls Overpass", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    gateway.rows = rows();
    const jobs = await fetchOsmPractices({ query: "counselling", locations: ["Pune"] }, needsSetup);
    expect(gateway.calls[0]).toMatchObject({ query: "", limit: 100, offset: 0 });
    expect(jobs.map((j) => j.company)).toEqual(["Calm Minds Counselling Centre"]);
    expect(fetched).not.toHaveBeenCalled();
    // No place asked: every practice from this gateway source, once each, no person's own name; one with no known city says "India".
    const all = await fetchOsmPractices({ query: "counselling", locations: [] }, needsSetup);
    expect(all.map((j) => j.company).sort()).toEqual(["Calm Minds Counselling Centre", "Mumbai Mind Care Clinic", "Remote Village Clinic"]);
    expect(all.find((j) => j.company === "Remote Village Clinic")!.location).toBe("India");
  });

  it("pages through a hundred at a time, and stops at a short page", async () => {
    gateway.rows = Array.from({ length: 230 }, (_, i) => listing(`node/${i}`, `Practice ${i} Counselling Centre`, { healthcare: "counselling", lat: PUNE.lat, lon: PUNE.lon }));
    const jobs = await fetchOsmPractices({ query: "counselling", locations: [] }, needsSetup);
    expect(jobs).toHaveLength(230);
    expect(gateway.calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it("is Needs setup where the gateway isn't configured, never an empty answer made to look real", async () => {
    gateway.configured = false;
    await expect(fetchOsmPractices({ query: "counselling", locations: ["Pune"] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("data gateway") });
    await expect(runTherapistsSource(THERAPISTS_SOURCES.find((s) => s.id === OPENSTREETMAP_THERAPISTS)!, { query: "counselling", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError" });
  });

  it("is a source of this module's own dataset, available only where the gateway is set up", () => {
    const s = THERAPISTS_SOURCES.find((x) => x.id === OPENSTREETMAP_THERAPISTS)!;
    expect(s).toMatchObject({ module: "therapists", name: "OpenStreetMap" });
    expect(therapistsSourceAvailable(s)).toBe(false);
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "t");
    vi.stubEnv("GATEWAY_CURSOR_SECRET", "s");
    expect(therapistsSourceAvailable(s)).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("what Share does with a mapped practice, and the definition files", () => {
  it("a WonderWorks practitioner shares as before; a mapped practice has no public share page (it can't be booked there)", () => {
    const ws = shareOf({ id: "ws_1", origin: "wonderworks", postingId: "1", title: "Counselling", company: "Calm", location: "Pune", terms: { currency: "INR", modes: ["online"], feeMin: 1500 }, description: "x", sourceId: "s", sourceName: "WonderWorks practitioners" });
    expect(ws.url).toBe("/s/therapists/ws_1");
  });

  it("the four definition files ask for exactly the cities this table knows, practices only, with the credit and a weekly interval", async () => {
    const dir = join(__dirname, "../../../../data-gateway/sources");
    const files = readdirSync(dir).filter((f) => /^osm-therapists-.+\.json$/.test(f));
    expect(files.sort()).toEqual(["osm-therapists-east.json", "osm-therapists-north.json", "osm-therapists-south.json", "osm-therapists-west.json"]);
    const asked: string[] = [];
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(d).toMatchObject({ kind: "json_api", modules: ["therapists"], itemsPath: "elements", attribution: OSM_GATEWAY_NAME, publicBusinesses: true, externalRedistributionAllowed: false, minIntervalMinutes: 10080 });
      // No opt-in is claimed: it's public practice listings from open data, which the gateway admits for therapists.
      expect(d.consentVerified).toBeUndefined();
      const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => { permissionEvidence: string } };
      expect(validateSource(d).permissionEvidence).toBe(d.permissionEvidence);
      expect(d.permissionEvidence.length).toBeLessThan(500);
      expect(d.extraUrls.length + 1).toBeLessThanOrEqual(7);
      // No contact details and no address are mapped.
      expect(Object.keys(d.mapping).concat(Object.values(d.mapping).flat() as string[]).filter((x) => x.startsWith("tags.") || x.startsWith("attr.")).join(" ")).not.toMatch(/phone|email|contact|addr:street|housenumber|operator/i);
      for (const u of [d.url, ...d.extraUrls]) {
        const url = new URL(u);
        expect(url.hostname).toBe("overpass-api.de");
        const q = decodeURIComponent(url.search.slice(6));
        expect(q).toMatch(/\["name"\]/);
        expect(q).toMatch(/\["healthcare"~/);
        expect(q).toMatch(/psychotherapist\|counselling\|psychologist/);
        const m = /around:15000,([\d.]+),([\d.]+)/.exec(q)!;
        const city = CITIES.find((c) => c.lat === Number(m[1]) && c.lon === Number(m[2]));
        expect(city, q).toBeDefined();
        asked.push(city!.name);
      }
    }
    expect(asked.sort()).toEqual(CITIES.map((c) => c.name).sort());
  });
});
