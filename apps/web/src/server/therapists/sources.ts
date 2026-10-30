/**
 * The Therapists module's own WorksLake sources: a separate dataset (module = 'therapists'), so none of these ever
 * answers a Jobs, Internships, Teaching or Talent & Services search and none of theirs ever answers a Therapists one
 * (server/jobslake/registry.ts::listSources).
 *
 * One real source for now: practitioners listed on WonderWorks. No outside directory (Psychology Today, Practo and
 * others) publishes an open search API, and WorksLake never scrapes a site against its terms, so none is listed here.
 * A search says so in its source line rather than implying coverage.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";

const EPOCH = "2026-10-30T00:00:00.000Z";

export const WONDERWORKS_THERAPISTS = "thp_wonderworks";

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
];

/** Whether this deployment can ask the source now: it is WonderWorks' own table, so it needs no credential. */
export const therapistsSourceAvailable = (s: SourceRecord) => THERAPISTS_SOURCES.some((x) => x.id === s.id);

/** Fetch one Therapists source. */
export async function runTherapistsSource(s: SourceRecord, c: SearchCriteria): Promise<{ jobs: Job[]; warnings: string[] }> {
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
