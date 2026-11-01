/**
 * The Talent & Services module's own WorksLake sources: a separate dataset (module = 'services'), so none of these ever
 * answers a Jobs, Internships or Teaching search and none of theirs ever answers a Talent & Services one
 * (server/jobslake/registry.ts::listSources).
 *
 * Real sources only, each through its official API:
 * - WonderWorks pros: listings pros post in their WonderWorks workspace (local and remote).
 * - Freelancer.com experts: its public user-directory API (/api/users/0.1/users/directory), asked for the client's words.
 *   Remote project work only; the pro's own Freelancer.com page opens. It reports a rating, reviews and an on-time share
 *   for a pro; WonderWorks shows exactly those and computes nothing.
 * Not here, on purpose: Urban Company, Justdial, Upwork and Fiverr publish no open search API, and WorksLake never
 * scrapes a site against its terms. Local, visit-based services therefore come only from pros who post on WonderWorks.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, getJson, type SearchCriteria } from "@/server/jobs/providers";
import { matchesLocations, normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import { fixtureJobsOn } from "@/server/jobslake/e2eFixture";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { CRAFT_CATEGORY, craftsFor, houzzCategoryOf, proTags } from "@/modules/services/domain";
import { nearestCity } from "@/modules/services/cities";
import { gatewayListings } from "@/server/gateway/listings";
import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";

const EPOCH = "2026-10-30T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, jobTypes: [], module: "services", ...p };
}

export const WONDERSTAR_SERVICES = "svc_wonderstar";
export const FREELANCER_EXPERTS = "svc_freelancer";
export const OPENSTREETMAP = "svc_osm";
export const HOUZZ = "svc_houzz";
/** The name the gateway's Houzz sources carry (their `attribution`): how this source recognises its own listings. */
export const HOUZZ_GATEWAY_NAME = "Houzz (houzz.in)";
/** The name the gateway's OpenStreetMap sources carry (their `attribution`): how this source recognises its own listings. */
export const OSM_GATEWAY_NAME = "OpenStreetMap contributors (ODbL)";

export const SERVICES_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_SERVICES, name: "WonderWorks pros", provider: "WonderWorks", category: "portal", geography: ["global"], description: "Services pros post on WonderWorks: local, visit-based work and remote projects." }),
  source({ id: FREELANCER_EXPERTS, name: "Freelancer.com experts", provider: "Freelancer.com", category: "aggregator", geography: ["remote"], capabilities: [...FEED_CAPS, "Rating"], description: "Remote freelancers from Freelancer.com's public user directory." }),
  source({
    id: OPENSTREETMAP,
    name: "OpenStreetMap",
    provider: "OpenStreetMap contributors",
    category: "aggregator",
    geography: ["IN"],
    description: "Local trade businesses mapped in OpenStreetMap (open data, ODbL): plumbers, electricians, AC, carpenters, painters and repair shops. Collected weekly by the data gateway, never asked per search. Businesses only; no phone or email is copied.",
  }),
  source({
    id: HOUZZ,
    name: "Houzz professionals",
    provider: "Houzz",
    category: "aggregator",
    geography: ["IN"],
    capabilities: [...FEED_CAPS, "Rating"],
    description: "Interior designers, architects, contractors and renovation firms listed on Houzz India, as their public profiles state them: name, city, rating and review count, services listed, own website. Collected by the data gateway from the public profile pages, politely and on a schedule, never per search. No phone or email is copied. Terms pending: Houzz's terms on automated access.",
  }),
];

/** Whether this deployment can ask the source now. The first two need no credential; OpenStreetMap needs the data gateway. */
export const servicesSourceAvailable = (s: SourceRecord) => fixtureJobsOn() || (s.id === OPENSTREETMAP || s.id === HOUZZ ? !!process.env.GATEWAY_ADMIN_TOKEN && !!process.env.GATEWAY_CURSOR_SECRET : SERVICES_SOURCES.some((x) => x.id === s.id));

/** One user of Freelancer.com's directory, only the fields asked for. */
export interface FreelancerUser {
  id: number;
  username: string;
  display_name?: string | null;
  public_name?: string | null;
  tagline?: string | null;
  profile_description?: string | null;
  hourly_rate?: number | null;
  closed?: boolean | null;
  role?: string | null;
  is_profile_visible?: boolean | null;
  registration_date?: number | null;
  primary_currency?: { code?: string } | null;
  location?: { country?: { name?: string | null }; city?: string | null } | null;
  jobs?: { name: string }[] | null;
  reputation?: { entire_history?: { overall?: number | null; reviews?: number | null; complete?: number | null; on_time?: number | null } } | null;
}

const pct = (v: number | null | undefined) => (typeof v === "number" && v >= 0 && v <= 1 ? Math.round(v * 100) : undefined);
const positive = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : undefined);

/** A directory user as a posting: only what Freelancer.com reported. A pro with no skills and no description isn't listed. */
export function rawFromFreelancerUser(u: FreelancerUser): RawPosting | null {
  if (u.closed || u.role === "employer" || u.is_profile_visible === false) return null;
  const name = (u.public_name || u.display_name || u.username || "").trim();
  const skills = (u.jobs ?? []).map((j) => j.name).filter(Boolean);
  const about = (u.profile_description ?? "").trim();
  if (!name || (!skills.length && !about)) return null;
  const h = u.reputation?.entire_history;
  const country = u.location?.country?.name ?? undefined;
  const rate = positive(u.hourly_rate);
  return {
    externalId: String(u.id),
    title: (u.tagline ?? "").trim() || skills.slice(0, 4).join(", ") || name,
    company: name,
    // Remote work is open to a client anywhere: the pro's own country travels as a fact (`country:`), not as a restriction.
    location: "Remote",
    remote: true,
    description: about || `Skills: ${skills.join(", ")}`,
    tags: proTags({
      skills: skills.slice(0, 8),
      ...(rate ? { rate: { amount: rate, currency: u.primary_currency?.code ?? "USD" } } : {}),
      ...(positive(h?.overall) ? { rating: Math.round(h!.overall! * 100) / 100 } : {}),
      ...(positive(h?.reviews) ? { reviews: h!.reviews! } : {}),
      ...(positive(h?.complete) ? { completed: h!.complete! } : {}),
      ...(pct(h?.on_time) !== undefined ? { onTimePct: pct(h?.on_time) } : {}),
      ...(country ? { country } : {}),
    }),
    // A directory profile is not a dated posting: its only date is when the account was made, which WorksLake's two-week
    // age rule (domain/jobs/age.ts) read as "too old" and dropped every pro. No date, so it isn't judged for age.
    postedAt: null,
    applyUrl: `https://www.freelancer.com/u/${encodeURIComponent(u.username)}`,
    employerSite: false,
  };
}

const DIRECTORY = "https://www.freelancer.com/api/users/0.1/users/directory/";

/** Freelancer.com's directory asked for the client's words; one page (the API ranks by relevance). */
export async function fetchFreelancerExperts(c: SearchCriteria): Promise<Job[]> {
  const q = c.query.trim();
  if (!q) return [];
  const url = `${DIRECTORY}?query=${encodeURIComponent(q)}&limit=40&jobs=true&reputation=true&country_details=true&profile_description=true`;
  const res = await getJson<{ result?: { users?: FreelancerUser[] } }>(url);
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const u of res.result?.users ?? []) {
    const raw = rawFromFreelancerUser(u);
    if (!raw) continue;
    const job = normalizePosting(FREELANCER_EXPERTS, raw);
    if (seen.has(job.id) || !matchesLocations(job, c.locations)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * An OpenStreetMap business the gateway collected, as a posting: its name, trade, the nearest city (from its position,
 * within 25 km of a city centre) and its own website if it has an https one. Only what OSM has: no price, rating, phone
 * or email (a sole trader's phone is personal data, and the owner asked for business listings). `null` for a record that
 * isn't a named business with a known trade.
 */
export function rawFromOsm(l: GatewayListing): (RawPosting & { city?: string }) | null {
  const a = l.attributes;
  const craft = str(a.craft);
  const name = str(l.title);
  if (!name || !CRAFT_CATEGORY[craft]) return null;
  const lat = num(a.lat) ?? num(a.clat);
  const lon = num(a.lon) ?? num(a.clon);
  const city = lat !== undefined && lon !== undefined ? nearestCity(lat, lon)?.name : str(a.city) || undefined;
  const web = /^https:\/\/[^\s]+$/i.test(str(a.website)) ? str(a.website) : undefined;
  const area = [str(a.suburb), city].filter(Boolean).join(", ");
  return {
    externalId: l.id,
    title: name,
    company: name,
    location: city ?? "India",
    city,
    description: `${CRAFT_CATEGORY[craft]}${area ? ` in ${area}` : ""}. Listed on OpenStreetMap.`,
    tags: proTags({ craft, ...(city ? { city } : {}), ...(web ? { web } : {}) }),
    postedAt: null,
    // Where OpenStreetMap lists it; the business's own website (tagged by its mappers) is carried as a fact.
    applyUrl: l.canonicalUrl,
    employerSite: false,
  };
}

/**
 * What the data gateway collected for Services from one source (recognised by its `attribution`), as postings: the gateway
 * answers a hundred at a time, so a few pages cover a search; a business shows once; the client's places are answered by
 * each business's own city. Nothing here fetches from the outside: collection is the gateway's, weekly or hourly, bounded.
 */
async function readGateway(sourceId: string, gatewayName: string, name: string, queries: string[], places: string[], map: (l: GatewayListing) => (RawPosting & { city?: string }) | null, needsSetup: (m: string) => Error): Promise<Job[]> {
  const out: Job[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    for (let offset = 0; offset < 500; offset += 100) {
      const g = await gatewayListings("services", { query, limit: 100, offset });
      if (!g.configured) throw needsSetup(`${name} listings come from the data gateway, which isn't set up on this deployment.`);
      for (const l of g.results) {
        if (l.sourceName !== gatewayName) continue;
        const raw = map(l);
        if (!raw || seen.has(raw.externalId)) continue;
        if (places.length && !(raw.city && places.some((p) => raw.city!.toLowerCase().includes(p) || p.includes(raw.city!.toLowerCase())))) continue;
        seen.add(raw.externalId);
        out.push(normalizePosting(sourceId, raw));
      }
      if (g.results.length < 100) break;
    }
  }
  return out;
}

const placesOf = (c: SearchCriteria) => c.locations.map((p) => p.trim().toLowerCase()).filter(Boolean);

/**
 * OpenStreetMap businesses for a client's words and places. The trade comes from the client's words; the place is the
 * nearest city of each business, so a business with no address still answers "Pune".
 */
export function fetchOsmBusinesses(c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  const crafts = craftsFor(c.query);
  return readGateway(OPENSTREETMAP, OSM_GATEWAY_NAME, "OpenStreetMap businesses", crafts.length ? crafts : [c.query], placesOf(c), rawFromOsm, needsSetup);
}

/**
 * A Houzz professional the gateway collected, as a posting: what their own public profile states — name, the city of
 * their address (never the street or postcode), their description, the rating and review count Houzz shows, the
 * services they list and their own website. No phone or email. `null` for a record that isn't one of Houzz's service
 * categories (photographers, furniture and bedding shops are left out) or has no name.
 */
export function rawFromHouzz(l: GatewayListing): (RawPosting & { city?: string }) | null {
  const a = l.attributes;
  const name = str(l.title);
  const category = houzzCategoryOf(l.canonicalUrl);
  if (!name || !category) return null;
  const city = str(l.location).split(",")[0].trim() || undefined;
  const rating = num(a.rating);
  const reviews = num(a.reviews);
  const web = /^https:\/\/[^\s]+$/i.test(str(a.website)) ? str(a.website) : undefined;
  const services = str(a.services).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  return {
    externalId: l.id,
    title: name,
    company: name,
    location: city ?? "India",
    city,
    description: str(l.description) || `${category}${city ? ` in ${city}` : ""}. Listed on Houzz.`,
    tags: proTags({ cat: category, ...(city ? { city } : {}), ...(web ? { web } : {}), ...(services.length ? { skills: services } : {}), ...(rating !== undefined && rating > 0 && rating <= 5 ? { rating } : {}), ...(reviews !== undefined && reviews >= 0 ? { reviews } : {}) }),
    postedAt: null,
    // The business's Houzz profile; its own website (as it states it) is carried as a fact.
    applyUrl: l.canonicalUrl,
    employerSite: false,
  };
}

/** Houzz professionals for a client's words and places (design, build and renovation work). */
export function fetchHouzzProfessionals(c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  return readGateway(HOUZZ, HOUZZ_GATEWAY_NAME, "Houzz professionals", [c.query], placesOf(c), rawFromHouzz, needsSetup);
}

/**
 * Fetch one Talent & Services source. Under the E2E fixture only the WonderWorks pros source is real (the test's own
 * listings); outside sources answer nothing.
 */
export async function runServicesSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_SERVICES) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_SERVICES: {
      const { openServicePosts } = await import("./listings");
      // The client's words and places narrow pros' listings, as every source's postings (finish).
      const raws: RawPosting[] = (await openServicePosts()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: [posting.terms.category ?? "", ...(posting.terms.skills ?? [])].filter(Boolean),
        postedAt: posting.updatedAt,
        // A quote is requested in WonderWorks; this is where the listing lives.
        applyUrl: new URL(`/app/m/services?listing=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
      }));
      return { jobs: finish(WONDERSTAR_SERVICES, raws, c), warnings: [] };
    }
    case FREELANCER_EXPERTS:
      return { jobs: await fetchFreelancerExperts(c), warnings: [] };
    case OPENSTREETMAP:
      return { jobs: await fetchOsmBusinesses(c, needsSetup), warnings: [] };
    case HOUZZ:
      return { jobs: await fetchHouzzProfessionals(c, needsSetup), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
