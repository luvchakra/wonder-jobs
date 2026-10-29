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
 * - Arbeitnow and Jobicy: their public APIs, which report each posting's job types.
 * - The Muse and Himalayas: their public APIs asked for internships only (level=Internship, employment_type=Intern).
 * - USAJOBS: the US government's Search API, for jobs open to students (Pathways internships) — needs USAJOBS_API_KEY + USAJOBS_EMAIL.
 * - Jooble: its REST API asked for internships — needs JOOBLE_API_KEY.
 * Connectors for the internship-only APIs are in ./providers.ts.
 * Not here, on purpose: Internshala and LinkedIn publish no open job-search API (LinkedIn's Job Posting API is partner-only,
 * Internshala has none), and JobsLake never scrapes a site against its terms. AICTE's internship portal and India's NATS publish
 * no open API or feed either. Community-curated lists on GitHub (e.g. SimplifyJobs' internship lists) carry no licence, so their
 * data isn't reused.
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
import { asIntern, fetchHimalayasInternships, fetchJoobleInternships, fetchMuseInternships, fetchUsaJobsInternships, joobleAvailable, usaJobsAvailable } from "./providers";

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
  source({ id: "intern_themuse", name: "The Muse internships", provider: "The Muse", category: "aggregator", geography: ["global", "IN", "remote"], description: "Internships from The Muse's public jobs API (level: Internship)." }),
  source({ id: "intern_himalayas", name: "Himalayas internships", provider: "Himalayas", category: "aggregator", geography: ["remote"], capabilities: [...FEED_CAPS, "Salary"], description: "Remote internships from Himalayas' search API (employment type: Intern)." }),
  source({ id: "intern_arbeitnow", name: "Arbeitnow internships", provider: "Arbeitnow", category: "aggregator", geography: ["DE", "remote"], description: "Internships (Praktikum) from Arbeitnow's public job-board API." }),
  source({ id: "intern_jobicy", name: "Jobicy internships", provider: "Jobicy", category: "aggregator", geography: ["remote"], capabilities: [...FEED_CAPS, "Salary"], description: "Remote internships from Jobicy's public API." }),
  source({ id: "intern_usajobs", name: "USAJOBS student internships", provider: "USAJOBS", category: "portal", geography: ["US"], secretRef: "env:USAJOBS", capabilities: [...FEED_CAPS, "Salary"], description: "US federal internships open to students (Pathways) from the USAJOBS Search API." }),
  source({ id: "intern_jooble", name: "Jooble internships", provider: "Jooble", category: "aggregator", geography: ["global", "IN"], secretRef: "env:JOOBLE", description: "Internships from Jooble's REST API." }),
];

/** Only internships: as the source reported the type, or as the title says it. A posting that says neither isn't one. */
export const isInternship = (j: Pick<Job, "jobType">) => j.jobType === "internship";

const boards = CAREER_BOARDS.map((b) => ({ platform: b.ats, slug: b.slug, company: b.company, domain: b.domain }));

/** Whether this deployment can ask the source now (credentials present). */
export function internshipSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  if (s.id === "intern_adzuna_in") return SOURCE_FETCHERS.adzuna_in.available();
  if (s.id === "intern_usajobs") return usaJobsAvailable();
  if (s.id === "intern_jooble") return joobleAvailable();
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
    case "intern_arbeitnow":
      return { jobs: (await SOURCE_FETCHERS.arbeitnow.fetch(c)).filter(isInternship), warnings: [] };
    case "intern_jobicy":
      return { jobs: (await SOURCE_FETCHERS.jobicy.fetch(c)).filter(isInternship), warnings: [] };
    case "intern_themuse":
      return { jobs: (await fetchMuseInternships(c)).filter(isInternship), warnings: [] };
    case "intern_himalayas":
      return { jobs: (await fetchHimalayasInternships(c)).filter(isInternship), warnings: [] };
    case "intern_usajobs":
      if (!usaJobsAvailable()) throw needsSetup(`${s.name} needs USAJOBS_API_KEY and USAJOBS_EMAIL on this deployment.`);
      return { jobs: (await fetchUsaJobsInternships(c)).filter(isInternship), warnings: [] };
    case "intern_jooble":
      if (!joobleAvailable()) throw needsSetup(`${s.name} needs JOOBLE_API_KEY on this deployment.`);
      return { jobs: (await fetchJoobleInternships(c)).filter(isInternship), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
