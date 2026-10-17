import { z } from "zod";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { Application, ApplicationStatus } from "@/domain/applications/types";
import { APPLICATION_STATUS_META, applicationJobOf } from "@/domain/applications/types";
import { FIT_META, type CanonicalJob, type JobMatch } from "@/domain/jobs/types";
import { hashKey, newId } from "@/lib/ids";
import { jobIdFromAtsUrl } from "@/services/jobs/atsUrl";
import { canonicalKey, computeMatch } from "@/services/jobs/matching";
import { normalizePosting } from "@/services/jobs/normalize";
import { readClientState, writeClientState } from "@/server/clientState";
import { companyLogo } from "@/server/jobslake/companies";

/**
 * A job the candidate is looking at in their own browser, read by the helper's side panel
 * (docs/EXTENSION_BEYOND_AUTOFILL.md). The page's text is untrusted data: fields are parsed out of it
 * and shown or scored, never treated as instructions, and nothing here acts on it by itself.
 */
export const PageJobSchema = z.object({
  url: z.string().url().max(2048),
  /** How the helper read it: the page's schema.org JobPosting, a site reader, or the page's main text. */
  via: z.enum(["jsonld", "linkedin", "naukri", "page"]),
  title: z.string().trim().min(2).max(300),
  company: z.string().trim().max(200).default(""),
  location: z.string().trim().max(300).default(""),
  /** Plain text or the posting's HTML; trimmed to 50 KB by the helper, re-trimmed here. */
  description: z.string().max(60_000).default(""),
  datePosted: z.string().max(64).optional(),
  remote: z.boolean().optional(),
  salaryText: z.string().max(200).optional(),
  employmentType: z.string().max(100).optional(),
});
export type PageJob = z.infer<typeof PageJobSchema>;

/** Persist versions of the two client stores written here — the same constants as their `persist(…, { version })`. */
const JOBS_STORE_VERSION = 2;
const APPLICATIONS_STORE_VERSION = 1;

type JobsDoc = { jobs?: Record<string, CanonicalJob>; order?: string[]; matches?: Record<string, JobMatch>; saved?: Record<string, string> };
type ApplicationsDoc = { applications?: Record<string, Application> };

/** The posting's own address, without tracking parameters or fragments — what "the same job" means for a page. */
export function canonicalJobUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  const host = url.hostname.toLowerCase();
  // LinkedIn's search pages carry the job in ?currentJobId=; the job's own page is /jobs/view/<id>.
  if (host.endsWith("linkedin.com")) {
    const id = url.searchParams.get("currentJobId") ?? url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  const keep = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (/^(gh_jid|jobid|job_id|id|jid|token|for|reqid|requisitionid)$/i.test(k)) keep.set(k, v);
  url.search = keep.toString();
  return url.toString();
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const BOARDS = /(^|\.)(linkedin\.com|naukri\.com|indeed\.com|glassdoor\.[a-z.]+|monster\.com|foundit\.in|instahyre\.com|wellfound\.com|iimjobs\.com|hirist\.tech|shine\.com)$/;

/** The page as a job WonderJobs can score and keep. ATS pages get the id a search would give the same posting, so they're never kept twice. */
export function jobFromPage(page: PageJob, now = Date.now()): CanonicalJob {
  const url = canonicalJobUrl(page.url);
  const host = hostOf(url);
  const onBoard = BOARDS.test(host);
  const atsId = jobIdFromAtsUrl(url);
  const job = normalizePosting(
    "browser",
    {
      externalId: url,
      title: page.title,
      company: page.company,
      location: page.location,
      remote: page.remote,
      description: page.description.slice(0, 50_000),
      postedAt: page.datePosted ?? null,
      applyUrl: url,
      salaryText: page.salaryText ?? null,
      employerSite: !onBoard,
    },
    now,
  );
  const canonical: CanonicalJob & { sourceId?: string; externalId?: string } = { ...job, id: atsId ?? `browser_${hashKey(url)}`, canonicalKey: canonicalKey(job), sourceIds: ["browser"], duplicateOf: [] };
  delete canonical.sourceId;
  delete canonical.externalId;
  return canonical;
}

/** Enough Career DNA to judge a posting against: a role, a headline or some skills. Otherwise the panel asks for them rather than showing a made-up score. */
export function canMatch(dna: CareerDNA): boolean {
  return !!(dna.careerGoal?.trim() || dna.headline?.trim() || dna.skills.length);
}

export interface PageJobView {
  jobId: string;
  title: string;
  company: string;
  location: string;
  /** Where the posting was read — shown as provenance ("Read from linkedin.com"). */
  readFrom: string;
  via: PageJob["via"];
  match: { score: number; fit: JobMatch["fit"]; fitLabel: string; reasons: { label: string; summary: string }[]; gap?: { label: string; summary: string } } | null;
  /** Null when the Career DNA is too thin to match against. */
  needsProfile: boolean;
  /** The candidate's application for this job, when there is one. */
  application: { id: string; status: ApplicationStatus; statusLabel: string; since: string } | null;
  /** The company's logo from JobsLake's directory (a data: URL), when it has one; the panel shows the initial otherwise. */
  logo?: string;
}

/** The company's logo from JobsLake — only for a company it recorded from a real posting; never looked up by guessing. */
async function logoOf(job: CanonicalJob): Promise<string | undefined> {
  const l = await companyLogo({ domain: job.companyDomain, name: job.company }).catch(() => undefined);
  return l ? `data:${l.type};base64,${l.data.toString("base64")}` : undefined;
}

/** An application for this job: by id, else by the same posting address (a job found by a search and then opened in the browser). */
function findApplication(apps: Record<string, Application>, jobs: Record<string, CanonicalJob>, job: CanonicalJob): Application | undefined {
  const list = Object.values(apps);
  const byId = list.find((a) => a.jobId === job.id);
  if (byId) return byId;
  return list.find((a) => {
    const url = a.job?.applyUrl ?? jobs[a.jobId]?.applyUrl;
    if (!url) return false;
    try {
      return canonicalJobUrl(url) === job.applyUrl;
    } catch {
      return false;
    }
  });
}

function view(job: CanonicalJob, page: PageJob, match: JobMatch | null, app: Application | undefined): PageJobView {
  const positive = match ? [...match.reasons].filter((r) => r.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 3) : [];
  const weakest = match ? [...match.reasons].sort((a, b) => a.score - b.score)[0] : undefined;
  return {
    jobId: app?.jobId ?? job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    readFrom: hostOf(job.applyUrl),
    via: page.via,
    match: match ? { score: match.score, fit: match.fit, fitLabel: FIT_META[match.fit].label, reasons: positive.map((r) => ({ label: r.label, summary: r.summary })), gap: weakest && weakest.score < 0.5 ? { label: weakest.label, summary: weakest.summary } : undefined } : null,
    needsProfile: !match,
    application: app ? { id: app.id, status: app.status, statusLabel: APPLICATION_STATUS_META[app.status]?.label ?? app.status, since: app.appliedAt ?? app.createdAt } : null,
  };
}

async function load(tenantId: string) {
  const [career, jobsDoc, appsDoc] = await Promise.all([
    readClientState<{ dna?: CareerDNA }>(tenantId, "wj.career"),
    readClientState<JobsDoc>(tenantId, "wj.jobs"),
    readClientState<ApplicationsDoc>(tenantId, "wj.applications"),
  ]);
  return { dna: career?.dna ?? EMPTY_DNA, jobs: jobsDoc?.jobs ?? {}, apps: appsDoc?.applications ?? {} };
}

/** Score the page's job against the candidate's own Career DNA, and say whether it's already in their Pipeline. Reads only. */
export async function readPageJob(tenantId: string, page: PageJob, now = Date.now()): Promise<PageJobView> {
  const { dna, jobs, apps } = await load(tenantId);
  const job = jobFromPage(page, now);
  const match = canMatch(dna) ? computeMatch(job, { dna }, now) : null;
  const logo = await logoOf(job);
  return { ...view(job, page, match, findApplication(apps, jobs, job)), ...(logo ? { logo } : {}) };
}

/**
 * Save the page's job for this tenant: the job into their catalog (kept like any saved job) and an
 * application at Saved. Saving the same posting again changes nothing. The candidate's click is the
 * action; nothing is sent anywhere outside their own account.
 */
export async function savePageJob(tenantId: string, page: PageJob, now = Date.now()): Promise<PageJobView & { created: boolean }> {
  const { dna, jobs, apps } = await load(tenantId);
  const fresh = jobFromPage(page, now);
  const existingApp = findApplication(apps, jobs, fresh);
  const job = jobs[existingApp?.jobId ?? fresh.id] ?? fresh;
  const match = canMatch(dna) ? computeMatch(job, { dna }, now) : null;
  if (existingApp) return { ...view(job, page, match, existingApp), created: false };

  const at = new Date(now).toISOString();
  const jobsDoc = (await readClientState<JobsDoc>(tenantId, "wj.jobs")) ?? {};
  await writeClientState<JobsDoc>(
    tenantId,
    "wj.jobs",
    JOBS_STORE_VERSION,
    {
      jobs: { ...(jobsDoc.jobs ?? {}), [job.id]: job },
      saved: { ...(jobsDoc.saved ?? {}), [job.id]: jobsDoc.saved?.[job.id] ?? at },
      ...(match ? { matches: { ...(jobsDoc.matches ?? {}), [job.id]: match } } : {}),
    },
    { merge: true },
  );

  const id = newId("app");
  const app: Application = {
    id,
    jobId: job.id,
    status: "saved",
    createdAt: at,
    artifacts: [],
    events: [{ id: newId("ev"), applicationId: id, type: "discovered", at, title: `Saved from ${hostOf(job.applyUrl)} with the browser helper` }],
    followUps: [],
    submissionKey: `submit:${job.id}:me`,
    job: applicationJobOf(job),
  };
  const appsDoc = (await readClientState<ApplicationsDoc>(tenantId, "wj.applications")) ?? {};
  await writeClientState<ApplicationsDoc>(tenantId, "wj.applications", APPLICATIONS_STORE_VERSION, { applications: { ...(appsDoc.applications ?? {}), [id]: app } }, { merge: true });
  return { ...view(job, page, match, app), created: true };
}
