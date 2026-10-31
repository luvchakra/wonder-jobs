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
];

/** Whether this deployment can ask the source now: it is WonderWorks' own table, so it needs no credential. */
export const eventsSourceAvailable = (s: SourceRecord) => EVENTS_SOURCES.some((x) => x.id === s.id);

/** Fetch one Events source. */
export async function runEventsSource(s: SourceRecord, c: SearchCriteria): Promise<{ jobs: Job[]; warnings: string[] }> {
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
