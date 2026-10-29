/**
 * The Internships module's own JobsLake sources (WJ-418): a separate dataset (module = 'internships'), so none of these
 * ever answers a Jobs search and no Jobs source ever answers an Internships one (server/jobslake/registry.ts::listSources).
 *
 * Real sources only, each through its official API, keeping only postings that are internships — as the source itself
 * reports the type, or as the posting's title says it (`domain/jobs/jobType.ts`); an untyped posting never counts:
 * - WonderWorks companies: internships posted in a hiring workspace (Internships → Company).
 * - Adzuna India: its search API asked for the student's words plus "intern" (needs the Adzuna credentials: "Needs setup" without).
 * - Company career sites: the Greenhouse, Lever and Ashby boards JobsLake already reads, and SmartRecruiters' public Posting API.
 * - Remotive and Remote OK: their public APIs (Remotive reports "internship" as a job type; Remote OK as a tag).
 * Not here, on purpose: Internshala and LinkedIn publish no open job-search API (LinkedIn's Job Posting API is partner-only,
 * Internshala has none), and JobsLake never scrapes a site against its terms.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import type { Depth } from "@/domain/jobslake/planner";
import { CAREER_BOARDS, finish, SOURCE_FETCHERS, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { fetchAtsBoards } from "@/server/jobslake/ats";
import { fixtureJobsOn } from "@/server/jobslake/e2eFixture";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";

const EPOCH = "2026-10-28T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL", "Job type"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, jobTypes: ["internship"], module: "internships", ...p };
}

export const WONDERSTAR_INTERNSHIPS = "intern_wonderstar";

export const INTERNSHIP_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_INTERNSHIPS, name: "WonderWorks companies", provider: "WonderWorks", category: "portal", geography: ["global"], description: "Internships companies post in their WonderWorks hiring workspace." }),
  source({ id: "intern_adzuna_in", name: "Adzuna India internships", provider: "Adzuna", category: "aggregator", geography: ["IN"], secretRef: "env:ADZUNA", capabilities: [...FEED_CAPS, "Salary"], description: "Adzuna India's search API, asked for internships." }),
  source({ id: "intern_careers", name: "Company career sites", provider: "Greenhouse, Lever, Ashby", category: "ats", geography: ["global"], description: "Internships on the Greenhouse, Lever and Ashby career sites JobsLake reads." }),
  source({ id: "intern_smartrecruiters", name: "SmartRecruiters career sites", provider: "SmartRecruiters", category: "ats", geography: ["IN", "global"], description: "Internships on SmartRecruiters career sites (public Posting API)." }),
  source({ id: "intern_remotive", name: "Remotive internships", provider: "Remotive", category: "aggregator", geography: ["remote"], description: "Remote internships from Remotive's public API." }),
  source({ id: "intern_remoteok", name: "Remote OK internships", provider: "Remote OK", category: "aggregator", geography: ["remote"], description: "Remote internships from Remote OK's public API." }),
];

/** Only internships: as the source reported the type, or as the title says it. A posting that says neither isn't one. */
export const isInternship = (j: Pick<Job, "jobType">) => j.jobType === "internship";

const boards = CAREER_BOARDS.map((b) => ({ platform: b.ats, slug: b.slug, company: b.company, domain: b.domain }));

/** A student's words, asked of a general job source as an internship search ("marketing" → "marketing intern"). */
const asIntern = (c: SearchCriteria): SearchCriteria => ({ ...c, query: /\b(intern|internship|trainee)\b/i.test(c.query) ? c.query : `${c.query} intern`.trim() });

/** Whether this deployment can ask the source now (credentials present). */
export function internshipSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  if (s.id === "intern_adzuna_in") return SOURCE_FETCHERS.adzuna_in.available();
  return INTERNSHIP_SOURCES.some((x) => x.id === s.id);
}

/**
 * Fetch one Internships source. Throws `needsSetup(message)` for missing credentials. Under the E2E fixture only the
 * WonderWorks companies source is real (the test's own postings); outside sources answer nothing.
 */
export async function runInternshipSource(s: SourceRecord, c: SearchCriteria, depth: Depth, needsSetup: (m: string) => Error): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_INTERNSHIPS) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_INTERNSHIPS: {
      const { openInternships } = await import("./applications");
      const raws: RawPosting[] = (await openInternships()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: posting.skills,
        postedAt: posting.updatedAt,
        // Applying happens in WonderWorks (Apply on the internship); this is where the posting lives.
        applyUrl: new URL(`/app/m/internships?posting=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
        jobType: "internship",
      }));
      return { jobs: finish(WONDERSTAR_INTERNSHIPS, raws, c), warnings: [] };
    }
    case "intern_adzuna_in": {
      const f = SOURCE_FETCHERS.adzuna_in;
      if (!f.available()) throw needsSetup(`${s.name} needs the Adzuna credentials on this deployment.`);
      return { jobs: (await f.fetch(asIntern(c))).filter(isInternship), warnings: [] };
    }
    case "intern_careers": {
      const r = await fetchAtsBoards(boards, c, depth);
      return { jobs: r.jobs.filter(isInternship), warnings: r.failures.map((x) => `${x.slug}: ${x.message}`) };
    }
    case "intern_smartrecruiters":
      return { jobs: (await SOURCE_FETCHERS.smartrecruiters.fetch(c)).filter(isInternship), warnings: [] };
    case "intern_remotive":
      return { jobs: (await SOURCE_FETCHERS.remotive.fetch(c)).filter(isInternship), warnings: [] };
    case "intern_remoteok":
      return { jobs: (await SOURCE_FETCHERS.remoteok.fetch(c)).filter(isInternship), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
