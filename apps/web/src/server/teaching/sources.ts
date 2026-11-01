/**
 * The Teaching module's own WorksLake sources: a separate dataset (module = 'teaching'), so none of these ever answers
 * a Jobs or Internships search and none of theirs ever answers a Teaching one (server/jobslake/registry.ts::listSources).
 *
 * Real sources only, each through its official API, keeping only postings whose own title says they're a teaching post
 * (`isTeachingTitle`):
 * - WonderWorks schools: openings schools, colleges and coaching centres post in their WonderWorks workspace.
 * - Adzuna India: its search API in its own Teaching jobs category (`teaching-jobs`) — needs the Adzuna credentials.
 * - Jooble: its REST API asked for the teacher's words as a teaching search — needs JOOBLE_API_KEY.
 * - Himalayas: its public search API asked the same way (remote and online teaching and tutoring).
 * - Adzuna, English-speaking countries: UK, US, Canada, Australia, New Zealand, South Africa and Singapore with the same
 *   Adzuna credentials as India (`adzuna.ts`); a posting's pay counts only when it states it, never Adzuna's prediction.
 * - USAJOBS: US federal teaching and education roles — needs USAJOBS_API_KEY and USAJOBS_EMAIL (free).
 * - Arbetsförmedlingen (Sweden): its open JobSearch API, education field, no key, licence CC0 (`jobtech.ts`).
 * Not here, on purpose: Naukri, Indeed and LinkedIn publish no open job-search API, and WorksLake never scrapes a site
 * against its terms.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { adzunaAvailable, adzunaSearch, finish, getJson, rawFromHimalayas, type HimalayasJob, type SearchCriteria } from "@/server/jobs/providers";
import { fetchUsaJobs, usaJobsAvailable } from "@/server/jobslake/usajobs";
import { fetchAdzunaTeaching } from "./adzuna";
import { fetchJobTechTeaching } from "./jobtech";
import { corePhrase, type RawPosting } from "@/services/jobs/normalize";
import { fixtureJobsOn } from "@/server/jobslake/e2eFixture";
import { fetchJooble, joobleAvailable } from "@/server/jobslake/jooble";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { asTeachingQuery, isTeachingTitle } from "@/modules/teaching/domain";

const EPOCH = "2026-10-30T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, jobTypes: [], module: "teaching", ...p };
}

export const WONDERSTAR_TEACHING = "teach_wonderstar";

export const TEACHING_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_TEACHING, name: "WonderWorks schools", provider: "WonderWorks", category: "portal", geography: ["global"], description: "Teaching openings schools, colleges and coaching centres post on WonderWorks." }),
  source({ id: "teach_adzuna_in", name: "Adzuna India teaching jobs", provider: "Adzuna", category: "aggregator", geography: ["IN"], secretRef: "env:ADZUNA", capabilities: [...FEED_CAPS, "Salary"], description: "Adzuna India's search API, in its Teaching jobs category." }),
  source({ id: "teach_jooble", name: "Jooble teaching jobs", provider: "Jooble", category: "aggregator", geography: ["global", "IN"], secretRef: "env:JOOBLE", description: "Teaching jobs from Jooble's REST API." }),
  source({ id: "teach_adzuna_world", name: "Adzuna teaching jobs — UK, US, Canada, Australia, NZ, South Africa, Singapore", provider: "Adzuna", category: "aggregator", geography: ["GB", "US", "CA", "AU", "NZ", "ZA", "SG"], secretRef: "env:ADZUNA", capabilities: [...FEED_CAPS, "Salary"], description: "Adzuna's search API in seven English-speaking countries, asked for teaching jobs; pay only where the posting states it." }),
  source({ id: "teach_usajobs", name: "USAJOBS teaching and education jobs", provider: "USAJOBS", category: "portal", geography: ["US"], secretRef: "env:USAJOBS", capabilities: [...FEED_CAPS, "Salary"], description: "US federal teaching and education roles from the USAJOBS Search API." }),
  source({ id: "teach_jobtech", name: "Arbetsförmedlingen teaching jobs (Sweden)", provider: "Arbetsförmedlingen", category: "portal", geography: ["SE"], description: "Sweden's public employment service's job ads in the education field, from its open JobSearch API (licence CC0)." }),
  source({ id: "teach_himalayas", name: "Himalayas teaching jobs", provider: "Himalayas", category: "aggregator", geography: ["remote"], capabilities: [...FEED_CAPS, "Salary"], description: "Remote and online teaching and tutoring from Himalayas' search API." }),
];

/** Only teaching posts: a posting whose title doesn't say it's one isn't kept. */
export const isTeaching = (j: Pick<Job, "title">) => isTeachingTitle(j.title);

/** Whether this deployment can ask the source now (credentials present). */
export function teachingSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  if (s.id === "teach_adzuna_in") return adzunaAvailable();
  if (s.id === "teach_jooble") return joobleAvailable();
  if (s.id === "teach_adzuna_world") return adzunaAvailable();
  if (s.id === "teach_usajobs") return usaJobsAvailable();
  return TEACHING_SOURCES.some((x) => x.id === s.id);
}

export async function fetchHimalayasTeaching(c: SearchCriteria): Promise<Job[]> {
  const q = corePhrase(asTeachingQuery(c.query));
  const pages = await Promise.all([1, 2].map((p, i) => getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`).catch((e) => (i === 0 ? Promise.reject(e) : { jobs: [] as HimalayasJob[] }))));
  return finish("teach_himalayas", pages.flatMap((p) => p.jobs ?? []).map(rawFromHimalayas), c);
}

/**
 * Fetch one Teaching source. Throws `needsSetup(message)` for missing credentials. Under the E2E fixture only the
 * WonderWorks schools source is real (the test's own postings); outside sources answer nothing.
 */
export async function runTeachingSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_TEACHING) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_TEACHING: {
      const { openTeachingPosts } = await import("./listings");
      const raws: RawPosting[] = (await openTeachingPosts()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: [posting.terms.subject ?? ""].filter(Boolean),
        postedAt: posting.updatedAt,
        // Applying happens in WonderWorks (Apply on the opening); this is where the posting lives.
        applyUrl: new URL(`/app/m/teaching?posting=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
      }));
      return { jobs: finish(WONDERSTAR_TEACHING, raws, c), warnings: [] };
    }
    case "teach_adzuna_in":
      if (!adzunaAvailable()) throw needsSetup(`${s.name} needs the Adzuna credentials on this deployment.`);
      return { jobs: (await adzunaSearch("teach_adzuna_in", c, "&category=teaching-jobs")).filter(isTeaching), warnings: [] };
    case "teach_jooble":
      if (!joobleAvailable()) throw needsSetup(`${s.name} needs JOOBLE_API_KEY on this deployment.`);
      return { jobs: (await fetchJooble("teach_jooble", asTeachingQuery(c.query), c)).filter(isTeaching), warnings: [] };
    case "teach_adzuna_world":
      if (!adzunaAvailable()) throw needsSetup(`${s.name} needs the Adzuna credentials on this deployment.`);
      return { jobs: (await fetchAdzunaTeaching("teach_adzuna_world", c)).filter(isTeaching), warnings: [] };
    case "teach_usajobs":
      if (!usaJobsAvailable()) throw needsSetup(`${s.name} needs USAJOBS_API_KEY and USAJOBS_EMAIL on this deployment.`);
      return { jobs: (await fetchUsaJobs("teach_usajobs", { ...c, query: asTeachingQuery(c.query) })).filter(isTeaching), warnings: [] };
    case "teach_jobtech":
      return { jobs: (await fetchJobTechTeaching("teach_jobtech", c)).filter(isTeaching), warnings: [] };
    case "teach_himalayas":
      return { jobs: (await fetchHimalayasTeaching(c)).filter(isTeaching), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
