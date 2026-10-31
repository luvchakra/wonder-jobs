/**
 * The Co-founders module's own WorksLake source: a separate dataset (module = 'cofounders'), so none of it ever answers a
 * Jobs, Internships, Teaching, Talent & Services or Therapists search and none of theirs ever answers a Co-founders one
 * (server/jobslake/registry.ts::listSources).
 *
 * One real source: the people and teams on WonderWorks who chose to be found. There is no outside source, because no
 * outside co-founder directory publishes an open search API and WorksLake never scrapes a site against its terms. A
 * search says so in its source line. What goes through WorksLake (and its shared cache) is only the public fields; the
 * search then reads each result's current public listing again, so a profile that has closed or hidden a field since is
 * never shown from a cached copy.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { WONDERWORKS_COFOUNDERS } from "./profiles";

const EPOCH = "2026-10-31T00:00:00.000Z";

export const COFOUNDERS_SOURCES: SourceRecord[] = [
  {
    protocolVersion: PROTOCOL_VERSION,
    id: WONDERWORKS_COFOUNDERS,
    name: "WonderWorks founders",
    provider: "WonderWorks",
    category: "portal",
    geography: ["global"],
    description: "People and teams on WonderWorks who chose to be found by a possible co-founder, with only the fields they show everyone.",
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
    module: "cofounders",
  },
];

/** Whether this deployment can ask the source now: it is WonderWorks' own tables, so it needs no credential. */
export const cofoundersSourceAvailable = (s: SourceRecord) => COFOUNDERS_SOURCES.some((x) => x.id === s.id);

/** Fetch one Co-founders source: open profiles and open teams, narrowed by the searcher's words and place like every source's postings. */
export async function runCofoundersSource(s: SourceRecord, c: SearchCriteria): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id !== WONDERWORKS_COFOUNDERS) throw new Error("No connector");
  const [{ openProfiles }, { openTeams }] = await Promise.all([import("./profiles"), import("./teams")]);
  const [people, teams] = await Promise.all([openProfiles(), openTeams()]);
  const raws: RawPosting[] = [...people.map((p) => p.listing), ...teams.map((t) => t.listing)].map((l) => ({
    externalId: l.id,
    title: l.title,
    company: l.kind === "team" ? "Team" : "Founder",
    location: l.location,
    remote: !l.location,
    description: [l.company, l.description].filter(Boolean).join("\n\n"),
    tags: [l.terms.role ?? "", l.terms.commitment ?? "", l.terms.stage ?? "", ...(l.terms.skills ?? []), ...(l.terms.openRoles ?? []).flatMap((o) => [o.role, ...o.skills])].filter(Boolean),
    postedAt: l.postedAt,
    applyUrl: new URL(`/app/m/cofounders/listing/${l.id}`, siteUrl().origin).toString(),
    employerSite: true,
    applyPath: "platform" as const,
  }));
  return { jobs: finish(WONDERWORKS_COFOUNDERS, raws, c), warnings: [] };
}
