/**
 * The Teaching module's own JobsLake sources (WJ-420): a separate dataset (module = 'teaching'), so none of these ever
 * answers a Jobs or Internships search, and none of theirs answers a Teaching one.
 *
 * Real sources only, each through its official API, keeping only postings whose title says it's teaching (teacher,
 * tutor, faculty, lecturer, PGT/TGT/PRT… — `modules/teaching/domain.ts::isTeachingTitle`):
 * - WonderStar schools: roles schools, colleges and coaching centres post in their hiring workspace (Teaching → School).
 * - Adzuna India: its search API asked for the teacher's words plus "teacher" (needs the Adzuna credentials: "Needs setup" without).
 * - Company career sites: the Greenhouse, Lever and Ashby boards JobsLake already reads (edtech companies' teaching roles).
 * Not here, on purpose: school job boards with no open API (Naukri, Indeed, LinkedIn, TeacherOn and similar) — never scraped.
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
import { isTeachingTitle } from "@/modules/teaching/domain";

const EPOCH = "2026-10-29T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, module: "teaching", ...p };
}

export const WONDERSTAR_TEACHING = "teach_wonderstar";

export const TEACHING_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_TEACHING, name: "WonderStar schools", provider: "WonderStar", category: "portal", geography: ["global"], description: "Teaching roles schools, colleges and coaching centres post in their WonderStar hiring workspace." }),
  source({ id: "teach_adzuna_in", name: "Adzuna India teaching", provider: "Adzuna", category: "aggregator", geography: ["IN"], secretRef: "env:ADZUNA", capabilities: [...FEED_CAPS, "Salary"], description: "Adzuna India's search API, asked for teaching roles." }),
  source({ id: "teach_careers", name: "Company career sites", provider: "Greenhouse, Lever, Ashby", category: "ats", geography: ["global"], description: "Teaching roles on the Greenhouse, Lever and Ashby career sites JobsLake reads." }),
];

/** Only teaching roles: the title says so. */
export const isTeachingJob = (j: Pick<Job, "title">) => isTeachingTitle(j.title);

const boards = CAREER_BOARDS.map((b) => ({ platform: b.ats, slug: b.slug, company: b.company, domain: b.domain }));
const asTeacher = (c: SearchCriteria): SearchCriteria => ({ ...c, query: isTeachingTitle(c.query) ? c.query : `${c.query} teacher`.trim() });

export function teachingSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  if (s.id === "teach_adzuna_in") return SOURCE_FETCHERS.adzuna_in.available();
  return TEACHING_SOURCES.some((x) => x.id === s.id);
}

/** Fetch one Teaching source. Under the E2E fixture only WonderStar schools is real; outside sources answer nothing. */
export async function runTeachingSource(s: SourceRecord, c: SearchCriteria, depth: Depth, needsSetup: (m: string) => Error): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_TEACHING) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_TEACHING: {
      const { openTeachingRoles } = await import("./applications");
      const raws: RawPosting[] = (await openTeachingRoles()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: [posting.terms.subject ?? "", ...posting.skills].filter(Boolean),
        postedAt: posting.updatedAt,
        applyUrl: new URL(`/app/m/teaching?posting=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
        jobType: posting.terms.schedule ?? null,
      }));
      // A school's own posting is a teaching role whatever its title says.
      return { jobs: finish(WONDERSTAR_TEACHING, raws, c), warnings: [] };
    }
    case "teach_adzuna_in": {
      const f = SOURCE_FETCHERS.adzuna_in;
      if (!f.available()) throw needsSetup(`${s.name} needs the Adzuna credentials on this deployment.`);
      return { jobs: (await f.fetch(asTeacher(c))).filter(isTeachingJob), warnings: [] };
    }
    case "teach_careers": {
      const r = await fetchAtsBoards(boards, c, depth);
      return { jobs: r.jobs.filter(isTeachingJob), warnings: r.failures.map((x) => `${x.slug}: ${x.message}`) };
    }
    default:
      throw new Error("No connector");
  }
}
