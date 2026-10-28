import { resolveCareersKey } from "./key";

/**
 * WonderStar' own careers page (owner, 2026-10-21): /careers lists the jobs the WonderStar company links to its
 * "On our own website" career site, takes applications and shows applicants their status. It is built exactly
 * like any other company's site would be: this server calls the public careers API with the site's key, and
 * WonderStar (the same deployment, reached over HTTPS) stores the applications and sends every email. This app
 * keeps no applicant data.
 *
 * Server only (src/clientBoundary.test.ts keeps browser code from importing it). The key is sent as a Bearer
 * header from here and never appears in a page, a log or an error. Logs carry only the job id, the status and the
 * time taken. Every call has an 8 s timeout; a GET is retried once on a network error or a 5xx, a POST never.
 */

export type CareerJob = {
  id: string;
  title: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  description: string;
  skills: string[];
  company: string;
  updatedAt: string;
};

export type CareerSiteInfo = { name: string; retentionMonths: number | null };

export type ApplicantStatus = {
  status: "new" | "reviewing" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";
  statusLabel: string;
  jobTitle: string;
  company: string;
  appliedAt: string;
  updatedAt: string;
  canWithdraw: boolean;
};

export type ApplicationBody = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl: string;
  coverNote?: string;
  consent: true;
};

/**
 * What a call came to. `rejected` carries WonderStar' own message for people (a 400 or a 409); `busy` is a 429
 * with how long to wait; `unauthorized` is a wrong or revoked key; `unavailable` is anything else.
 */
export type Result<T> =
  | { state: "ok"; data: T }
  | { state: "needs_setup" }
  | { state: "unauthorized" }
  | { state: "not_found" }
  | { state: "rejected"; status: 400 | 409; message: string }
  | { state: "busy"; retryAfterSec: number }
  | { state: "unavailable" };

export const CAREERS_BASE = "https://jobs.wonderapps.biz";
export const TIMEOUT_MS = 8_000;
const LIST_TTL_MS = 60_000;

/** WonderStar' address: fixed, or an override on an https *.wonderapps.biz host (for tests); anything else is refused. */
export function careersBase(override = process.env.WONDERJOBS_CAREERS_URL): string | null {
  if (!override?.trim()) return CAREERS_BASE;
  try {
    const u = new URL(override.trim());
    if (u.protocol !== "https:" || !u.hostname.endsWith(".wonderapps.biz") || u.username || u.password || u.port) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
export const isCareerJobId = (id: string) => JOB_ID.test(id);
const TOKEN = /^wjst_[A-Za-z0-9_-]{20,200}$/;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, opts: { method?: "GET" | "POST"; body?: unknown; logId?: string } = {}): Promise<Result<T>> {
  const key = await resolveCareersKey();
  if (!key) return { state: "needs_setup" };
  const base = careersBase();
  if (!base) return { state: "unavailable" };
  const method = opts.method ?? "GET";
  const attempts = method === "GET" ? 2 : 1;
  const what = `${method} ${opts.logId ? `job ${opts.logId}` : path.split("/")[1]}`;
  for (let i = 0; i < attempts; i++) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${base}/api/careers/v1${path}`, {
        method,
        headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(opts.body ? { "content-type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        redirect: "error",
      });
    } catch (e) {
      console.warn(`[careers-site] ${what} failed after ${Date.now() - started}ms (${e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network"})`);
      if (i + 1 < attempts) await wait(300);
      continue;
    }
    console.info(`[careers-site] ${what} ${res.status} ${Date.now() - started}ms`);
    const json = (await res.json().catch(() => ({}))) as T & { error?: unknown };
    if (res.ok) return { state: "ok", data: json };
    const message = typeof json.error === "string" && json.error.trim() ? json.error.trim().slice(0, 300) : "";
    if (res.status === 400 || res.status === 409) return { state: "rejected", status: res.status as 400 | 409, message: message || "Check the details and try again." };
    if (res.status === 401) return { state: "unauthorized" };
    if (res.status === 404) return { state: "not_found" };
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      return { state: "busy", retryAfterSec: Number.isFinite(after) && after > 0 ? Math.min(Math.ceil(after), 3600) : 30 };
    }
    if (res.status < 500 || i + 1 >= attempts) return { state: "unavailable" };
    await wait(300);
  }
  return { state: "unavailable" };
}

type JobList = { site: CareerSiteInfo; jobs: CareerJob[] };
let listCache: { at: number; data: JobList } | null = null;

/** Forgets the cached job list (after the key changes). */
export function clearCareersCache() {
  listCache = null;
}

/** The open jobs, kept in memory for up to a minute. Never anything per applicant. */
export async function listCareerJobs(now = Date.now()): Promise<Result<JobList>> {
  if (listCache && now - listCache.at < LIST_TTL_MS) return { state: "ok", data: listCache.data };
  const r = await call<{ site?: Partial<CareerSiteInfo>; jobs?: CareerJob[] }>("/jobs");
  if (r.state !== "ok") return r;
  const data: JobList = { site: siteInfo(r.data.site), jobs: Array.isArray(r.data.jobs) ? r.data.jobs : [] };
  listCache = { at: now, data };
  return { state: "ok", data };
}

const siteInfo = (s: Partial<CareerSiteInfo> | undefined): CareerSiteInfo => ({
  name: typeof s?.name === "string" ? s.name : "",
  retentionMonths: typeof s?.retentionMonths === "number" && s.retentionMonths > 0 ? s.retentionMonths : null,
});

export async function getCareerJob(id: string): Promise<Result<{ job: CareerJob; site: CareerSiteInfo }>> {
  if (!isCareerJobId(id)) return { state: "not_found" };
  const r = await call<{ job?: CareerJob; site?: Partial<CareerSiteInfo> }>(`/jobs/${encodeURIComponent(id)}`, { logId: id });
  if (r.state !== "ok") return r;
  return r.data.job ? { state: "ok", data: { job: r.data.job, site: siteInfo(r.data.site) } } : { state: "unavailable" };
}

export async function submitCareerApplication(jobId: string, body: ApplicationBody): Promise<Result<{ ok: true; id: string }>> {
  if (!isCareerJobId(jobId)) return { state: "not_found" };
  return call<{ ok: true; id: string }>(`/jobs/${encodeURIComponent(jobId)}/applications`, { method: "POST", body, logId: jobId });
}

/** The applicant's own status, from their email's token. The token travels in the body, never in an address. */
export async function careerApplicationStatus(token: string, action: "view" | "withdraw" = "view"): Promise<Result<ApplicantStatus>> {
  if (!TOKEN.test(token)) return { state: "not_found" };
  const r = await call<{ application?: ApplicantStatus }>("/applications/status", { method: "POST", body: { token, action } });
  if (r.state !== "ok") return r;
  return r.data.application ? { state: "ok", data: r.data.application } : { state: "not_found" };
}

export type ConnectionCheck = { state: "connected"; jobs: number; site: string } | { state: "wrong_key" } | { state: "unavailable" } | { state: "needs_setup" };

/** The admin's "Test connection": a fresh read of the job list, never the cached one. */
export async function testCareersConnection(): Promise<ConnectionCheck> {
  clearCareersCache();
  const r = await listCareerJobs();
  if (r.state === "ok") return { state: "connected", jobs: r.data.jobs.length, site: r.data.site.name };
  if (r.state === "unauthorized") return { state: "wrong_key" };
  if (r.state === "needs_setup") return { state: "needs_setup" };
  return { state: "unavailable" };
}
