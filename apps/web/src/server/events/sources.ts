/**
 * The Events module's own WorksLake sources: a separate dataset (module = 'events'), so none of these ever answers a Jobs,
 * Internships, Teaching, Services, Therapists or Co-founders search and none of theirs ever answers an Events one
 * (server/jobslake/registry.ts::listSources).
 *
 * One real source for now: events organisers post on WonderWorks. No outside listing (Meetup, Eventbrite and others) offers an
 * open search API WorksLake may use, and it never scrapes a site against its terms, so none is listed. A search says so in its
 * source line rather than implying coverage.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { DEVELOPERS_EVENTS, developersEventsSearch } from "./developersEvents";
import { OSM_CALENDAR, osmCalendarSearch } from "./osmCalendar";
import { TICKETMASTER, TICKETMASTER_KEY, ticketmasterAvailable, ticketmasterSearch } from "./ticketmaster";

const EPOCH = "2026-10-31T00:00:00.000Z";

export const WONDERWORKS_EVENTS = "evt_wonderworks";

export const EVENTS_SOURCES: SourceRecord[] = [
  {
    protocolVersion: PROTOCOL_VERSION,
    id: WONDERWORKS_EVENTS,
    name: "WonderWorks events",
    provider: "WonderWorks",
    category: "portal",
    geography: ["global"],
    description: "Meetups, workshops and plans that organisers post on WonderWorks, with their time, place and seats.",
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
    module: "events",
  },
  {
    protocolVersion: PROTOCOL_VERSION,
    id: DEVELOPERS_EVENTS,
    name: "developers.events",
    provider: "developers.events",
    category: "aggregator",
    geography: ["global", "IN"],
    description: "Developer conferences worldwide with their dates, place, own page and call for papers, from the public list its maintainers publish (developers.events). No key.",
    // Paused until the owner confirms the terms (CLAUDE.md "Finding data sources"); then Activate in the admin.
    status: "paused",
    statusReason: "Terms pending: developers.events publishes its list as public JSON but states no licence; confirm its reuse (or ask the maintainers) before activating.",
    roleFamilies: [],
    config: { kind: "builtin" },
    limits: { ...DEFAULT_LIMITS, timeoutMs: 25_000, maxResults: 150, refreshMinutes: 720 },
    builtin: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    accessStrategy: "official_feed",
    capabilities: ["Search", "Freshness", "Apply URL"],
    jobTypes: [],
    module: "events",
  },
  {
    protocolVersion: PROTOCOL_VERSION,
    id: OSM_CALENDAR,
    name: "OpenStreetMap Calendar",
    provider: "OpenStreetMap community",
    category: "aggregator",
    geography: ["global", "IN"],
    description: "Mapathons, meetups and State of the Map events from the OpenStreetMap community's calendar (osmcal.org), with each event's own page. No key.",
    // Paused until the owner confirms the terms (CLAUDE.md "Finding data sources"); then Activate in the admin.
    status: "paused",
    statusReason: "Terms pending: osmcal.org documents a public API for showing its events but states no data licence; confirm its reuse before activating.",
    roleFamilies: [],
    config: { kind: "builtin" },
    limits: { ...DEFAULT_LIMITS, timeoutMs: 15_000, maxResults: 150, refreshMinutes: 360 },
    builtin: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    accessStrategy: "official_feed",
    capabilities: ["Search", "Freshness", "Apply URL"],
    jobTypes: [],
    module: "events",
  },
  {
    protocolVersion: PROTOCOL_VERSION,
    id: TICKETMASTER,
    name: "Ticketmaster",
    provider: "Ticketmaster",
    category: "aggregator",
    geography: ["global"],
    description: "Concerts, sport, theatre and family events from Ticketmaster's Discovery API, with a link to each event's own Ticketmaster page. Needs a free API key.",
    status: "active",
    roleFamilies: [],
    config: { kind: "builtin" },
    // Asked once per search, as Ticketmaster's terms ask (calls follow a person's own action).
    limits: { ...DEFAULT_LIMITS, timeoutMs: 10_000, maxResults: 50, refreshMinutes: 60 },
    secretRef: `env:${TICKETMASTER_KEY}`,
    builtin: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    accessStrategy: "official_api",
    capabilities: ["Search", "Freshness", "Apply URL"],
    jobTypes: [],
    module: "events",
  },
];

/** Whether this deployment can ask the source now: WonderWorks' own events need no credential; Ticketmaster needs its key. */
export const eventsSourceAvailable = (s: SourceRecord) => (s.id === TICKETMASTER ? ticketmasterAvailable() : EVENTS_SOURCES.some((x) => x.id === s.id));

/** Fetch one Events source. */
export async function runEventsSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id === TICKETMASTER) return { jobs: await ticketmasterSearch(s, c, needsSetup), warnings: [] };
  if (s.id === DEVELOPERS_EVENTS) return { jobs: await developersEventsSearch(s, c), warnings: [] };
  if (s.id === OSM_CALENDAR) return { jobs: await osmCalendarSearch(s, c), warnings: [] };
  if (s.id !== WONDERWORKS_EVENTS) throw new Error("No connector");
  const { openEventPosts } = await import("./listings");
  // The person's words and places narrow the events, as every source's postings (finish).
  const raws: RawPosting[] = (await openEventPosts()).map(({ posting, org }) => ({
    externalId: posting.id,
    title: posting.title,
    company: org.name,
    location: posting.terms.online ? "Online" : posting.location,
    remote: posting.terms.online,
    description: posting.description,
    tags: posting.terms.tags,
    postedAt: posting.updatedAt,
    applyUrl: new URL(`/app/m/events?listing=${posting.id}`, siteUrl().origin).toString(),
    employerSite: true,
    applyPath: "platform" as const,
  }));
  return { jobs: finish(WONDERWORKS_EVENTS, raws, c), warnings: [] };
}
