/**
 * The Therapists module's own WorksLake sources: a separate dataset (module = 'therapists'), so none of these ever
 * answers a Jobs, Internships, Teaching or Talent & Services search and none of theirs ever answers a Therapists one
 * (server/jobslake/registry.ts::listSources).
 *
 * Two real sources:
 * - WonderWorks practitioners: counsellors and therapists who list themselves, in their own words.
 * - OpenStreetMap practices (WJ-600): practices and clinics mapped in OpenStreetMap (open data, ODbL), collected weekly
 *   by the data gateway (apps/data-gateway/sources/osm-therapists-*.json) and read here, never asked per search. Practices
 *   only: a named feature that is a person's own name with no word for a practice is left out (domain.ts::isPracticeName).
 *   Only what the map has (name, kind, the nearest city, its own website); no phone, email, address, licence or claim.
 * Not here, on purpose: Psychology Today, Practo and other directories that forbid it, and any register that is an
 * individual's profile. A search's source lines say what each source gave rather than implying coverage.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { normalizePosting } from "@/services/jobs/normalize";
import { gatewayListings } from "@/server/gateway/listings";
import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { nearestCity } from "@/wonderworks/find/cities";
import { OSM_GATEWAY_NAME } from "@/wonderworks/find/osm";
import { isPracticeName, osmTags, practiceKind } from "@/modules/therapists/domain";

const EPOCH = "2026-10-30T00:00:00.000Z";

export const WONDERWORKS_THERAPISTS = "thp_wonderworks";
export const OPENSTREETMAP_THERAPISTS = "thp_osm";

export const THERAPISTS_SOURCES: SourceRecord[] = [
  {
    protocolVersion: PROTOCOL_VERSION,
    id: WONDERWORKS_THERAPISTS,
    name: "WonderWorks practitioners",
    provider: "WonderWorks",
    category: "portal",
    geography: ["global"],
    description: "Counsellors and therapists who list themselves on WonderWorks, in their own words.",
    status: "active",
    roleFamilies: [],
    config: { kind: "builtin" },
    limits: DEFAULT_LIMITS,
    builtin: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    accessStrategy: "official_api",
    capabilities: ["Search", "Freshness"],
    jobTypes: [],
    module: "therapists",
  },
  {
    protocolVersion: PROTOCOL_VERSION,
    id: OPENSTREETMAP_THERAPISTS,
    name: "OpenStreetMap",
    provider: "OpenStreetMap contributors",
    category: "aggregator",
    geography: ["IN"],
    description: "Counselling, psychotherapy and psychology practices and mental-health clinics mapped in OpenStreetMap (open data, ODbL). Collected weekly by the data gateway, never asked per search. Practices only; no phone, email or address is copied, and nothing about a practice is checked or claimed.",
    status: "active",
    // The licence (ODbL) is clear and the credit is shown; what the owner confirms is where the weekly collection runs.
    statusReason: "terms pending: confirm the Overpass endpoint. The public overpass-api.de asks commercial use to run its own or a paid server; the gateway source starts paused until you pick one and press Test & Activate.",
    roleFamilies: [],
    config: { kind: "builtin" },
    limits: DEFAULT_LIMITS,
    builtin: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    accessStrategy: "official_api",
    capabilities: ["Search"],
    jobTypes: [],
    module: "therapists",
  },
];

/** Whether this deployment can ask the source now. WonderWorks' own table needs no credential; OpenStreetMap needs the data gateway. */
export const therapistsSourceAvailable = (s: SourceRecord) => (s.id === OPENSTREETMAP_THERAPISTS ? !!process.env.GATEWAY_ADMIN_TOKEN && !!process.env.GATEWAY_CURSOR_SECRET : THERAPISTS_SOURCES.some((x) => x.id === s.id));

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * An OpenStreetMap practice the gateway collected, as a posting: its name, what kind of practice the map says it is, the
 * nearest city (from its position, within 25 km of a city centre) and its own website if it has an https one. Only what the
 * map has: no phone, email, address, fee, language or licence, and no "verified" anything. `null` for a record that isn't a
 * named practice (no name, or a name that is only a person's).
 */
export function rawFromOsm(l: GatewayListing): (RawPosting & { city?: string }) | null {
  const a = l.attributes;
  const name = str(l.title);
  if (!name || !isPracticeName(name)) return null;
  const healthcare = str(a.healthcare) || undefined;
  const amenity = str(a.amenity) || undefined;
  if (!healthcare && !amenity) return null;
  const lat = num(a.lat) ?? num(a.clat);
  const lon = num(a.lon) ?? num(a.clon);
  const city = lat !== undefined && lon !== undefined ? nearestCity(lat, lon)?.name : str(a.city) || undefined;
  const web = /^https:\/\/[^\s]+$/i.test(str(a.website)) ? str(a.website) : undefined;
  const speciality = str(a.speciality) || undefined;
  const area = [str(a.suburb), city].filter(Boolean).join(", ");
  const facts = { healthcare, amenity, speciality, city, web };
  return {
    externalId: l.id,
    title: name,
    company: name,
    location: city ?? "India",
    city,
    description: `${practiceKind(facts)}${area ? ` in ${area}` : ""}. Listed on OpenStreetMap.`,
    tags: osmTags(facts),
    postedAt: null,
    // Where OpenStreetMap lists it; the practice's own website (tagged by its mappers) is carried as a fact.
    applyUrl: l.canonicalUrl,
    employerSite: false,
  };
}

/**
 * OpenStreetMap practices for a client's places, read from what the data gateway already collected (weekly, bounded, with
 * an identifying User-Agent). Nothing here calls Overpass. The place is the nearest city of each practice, so a practice
 * with no address still answers "Pune". The client's words are not sent to the gateway: a practice is mapped by name and
 * kind, so WorksLake's own search ranks them against those.
 */
export async function fetchOsmPractices(c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  const places = c.locations.map((p) => p.trim().toLowerCase()).filter(Boolean);
  const out: Job[] = [];
  const seen = new Set<string>();
  // The gateway answers a hundred at a time; a few pages cover the practices across the cities collected.
  for (let offset = 0; offset < 1000; offset += 100) {
    const g = await gatewayListings("therapists", { query: "", limit: 100, offset });
    if (!g.configured) throw needsSetup("OpenStreetMap practices come from the data gateway, which isn't set up on this deployment.");
    for (const l of g.results) {
      if (l.sourceName !== OSM_GATEWAY_NAME) continue;
      const raw = rawFromOsm(l);
      if (!raw || seen.has(raw.externalId)) continue;
      if (places.length && !(raw.city && places.some((p) => raw.city!.toLowerCase().includes(p) || p.includes(raw.city!.toLowerCase())))) continue;
      seen.add(raw.externalId);
      out.push(normalizePosting(OPENSTREETMAP_THERAPISTS, raw));
    }
    if (g.results.length < 100) break;
  }
  return out;
}

/** Fetch one Therapists source. */
export async function runTherapistsSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id === OPENSTREETMAP_THERAPISTS) return { jobs: await fetchOsmPractices(c, needsSetup), warnings: [] };
  if (s.id !== WONDERWORKS_THERAPISTS) throw new Error("No connector");
  const { openTherapistPosts } = await import("./listings");
  // The client's words and places narrow practitioners' listings, as every source's postings (finish).
  const raws: RawPosting[] = (await openTherapistPosts()).map(({ posting, org }) => ({
    externalId: posting.id,
    title: posting.title,
    company: org.name,
    location: posting.location,
    remote: posting.workMode === "remote",
    description: posting.description,
    tags: [...(posting.terms.focus ?? []), ...(posting.terms.languages ?? []), ...(posting.terms.approaches ?? [])],
    postedAt: posting.updatedAt,
    applyUrl: new URL(`/app/m/therapists?listing=${posting.id}`, siteUrl().origin).toString(),
    employerSite: true,
    applyPath: "platform" as const,
  }));
  return { jobs: finish(WONDERWORKS_THERAPISTS, raws, c), warnings: [] };
}
