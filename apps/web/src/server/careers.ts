/**
 * Career sites and applications (owner, 2026-10-21). A hiring workspace links its jobs to outside career pages
 * (WonderID's landing page first, other apps later). The page's server calls `/api/careers/v1/*` with the site's
 * secret key: it lists the jobs linked to that site, submits applications and shows an applicant their status.
 * WonderJobs stores and runs everything else: the applicant's confirmation, the hiring team's email, reminders
 * when nobody acts, and an email to the applicant on every decision.
 *
 * Workspace functions take the caller's session and check their role on the server (`domain/org/permissions.ts`)
 * through `requirePermission`; site functions take a site resolved from its key and only ever reach that site's
 * own organization and linked jobs. Every query names the organization, site or application (RLS has no policies).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Session } from "./auth";
import { table } from "./db/table";
import { sha256Hex } from "./crypto";
import { HiringError, openJobs, requirePermission } from "./hiring";
import { sendMail } from "./notify";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "./email/layout";
import { siteUrl } from "@/lib/siteUrl";
import { hashKey } from "@/lib/ids";
import { decryptFile, encryptFile, resumeFileStore } from "./resume/files";
import { can } from "@/domain/org/permissions";
import { cleanAnswers, unmetMustHaves, type ScreeningQuestion } from "@/domain/org/screening";
import { applicantFit, cleanApplicantProfile, cleanReview, summarizeReviews, type ApplicantProfile, type ApplicationReview, type Recommendation } from "@/domain/org/review";
import type { EmployerJob, OrgRole } from "@/domain/org/types";
import {
  APPLICATION_STATUS_LABEL,
  NEXT_STATUSES,
  OPEN,
  REMINDER_AFTER_HOURS,
  candidateMessage,
  deleteAfter,
  parseNotifyEmails,
  SLUG_PATTERN,
  RESERVED_SLUGS,
  careerLinks,
  cleanActionLink,
  cleanApplication,
  reminderDue,
  type Application,
  type ApplicationEvent,
  type ApplicationInput,
  type ApplicationStatus,
  type CareerSite,
} from "@/domain/org/careers";

// ---- rows ----------------------------------------------------------------------------------------------------
type SiteRow = { id: string; org_id: string; name: string; public_url: string; key_hash: string; key_hint: string; created_by: string; created_at: string; revoked_at: string | null; notify_emails?: string | null; retention_months?: number | null; slug?: string | null };
type SiteJobRow = { site_id: string; job_id: string; org_id: string; added_by: string; added_at: string };
type AppRow = {
  id: string;
  org_id: string;
  job_id: string;
  site_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  cover_note: string;
  status: ApplicationStatus;
  status_token_hash: string;
  consent_at: string;
  created_at: string;
  updated_at: string;
  last_action_at: string;
  reminders_sent: number;
  last_reminded_at: string | null;
  via?: "site" | "wonderjobs";
  answers?: Record<string, string> | null;
  profile?: ApplicantProfile | null;
};
type ReviewRow = { id: string; application_id: string; org_id: string; author_tenant: string; author_name: string; recommendation: Recommendation | null; note: string; created_at: string };
type FileRow = { application_id: string; org_id: string; filename: string; mime: string; ciphertext: string; created_at: string };
type EventRow = { application_id: string; org_id: string; event: string; actor: string | null; detail: string | null; at: string };
type JobRow = { id: string; org_id: string; title: string; location: string; work_mode: EmployerJob["workMode"]; job_type: string | null; salary_min: number | null; salary_max: number | null; currency: string; description: string; skills: string[]; screening?: ScreeningQuestion[] | null; status: string; created_by: string; updated_at: string };
type OrgRow = { id: string; name: string; website: string | null; verified?: boolean };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; email: string | null; name: string | null };

const sites = () => table<SiteRow>("career_sites");
const siteJobs = () => table<SiteJobRow>("career_site_jobs");
const apps = () => table<AppRow>("job_applications");
const events = () => table<EventRow>("job_application_events");
const files = () => table<FileRow>("job_application_files");
const reviews = () => table<ReviewRow>("job_application_reviews");
const jobs = () => table<JobRow>("employer_jobs");
const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");

const now = () => new Date().toISOString();
const id = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const secret = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;

/**
 * The applicant's status link token: an HMAC of the application id over the deployment's own secret, so every
 * email can carry it without storing it (same pattern as the calendar feed link). Only its hash is kept, to look
 * the application up. The link is the credential; it shows only the status and allows only withdrawing.
 */
function statusToken(applicationId: string): string {
  const key = process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY;
  if (!key) throw new Error("SECRET_ENCRYPTION_KEY is required to sign application status links");
  return `wjst_${createHmac("sha256", key).update(`career-status:${applicationId}`).digest("base64url")}`;
}

const siteEmails = (r: Pick<SiteRow, "notify_emails">) => (r.notify_emails ? r.notify_emails.split(",").filter(Boolean) : []);
const toSite = (r: SiteRow): CareerSite => ({ id: r.id, orgId: r.org_id, name: r.name, publicUrl: r.public_url, notifyEmails: siteEmails(r), retentionMonths: r.retention_months ?? undefined, slug: r.slug ?? undefined, keyHint: r.key_hint, createdAt: r.created_at, revokedAt: r.revoked_at ?? undefined });
const toApp = (r: AppRow): Application => ({
  id: r.id,
  orgId: r.org_id,
  jobId: r.job_id,
  siteId: r.site_id ?? undefined,
  name: r.name,
  email: r.email,
  phone: r.phone ?? undefined,
  location: r.location ?? undefined,
  linkedinUrl: r.linkedin_url ?? undefined,
  resumeUrl: r.resume_url ?? undefined,
  via: r.via ?? "site",
  coverNote: r.cover_note,
  ...(r.answers ? { answers: r.answers } : {}),
  ...(r.profile ? { profile: r.profile } : {}),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastActionAt: r.last_action_at,
  remindersSent: r.reminders_sent,
});

async function record(a: Pick<AppRow, "id" | "org_id">, event: string, actor: string | null, detail?: string) {
  await events().insert({ application_id: a.id, org_id: a.org_id, event, actor, detail: detail ?? null, at: now() });
}

// ---- career sites (workspace side) ---------------------------------------------------------------------------
export async function listSites(s: Session, orgId: string): Promise<{ sites: CareerSite[]; links: { siteId: string; jobId: string }[] }> {
  await requirePermission(s, orgId, "jobs.view");
  const rows = (await sites().find({ org_id: orgId }, { order: "created_at" })).filter((r) => !r.revoked_at);
  const links = await siteJobs().find({ org_id: orgId });
  return { sites: rows.map(toSite), links: links.map((l) => ({ siteId: l.site_id, jobId: l.job_id })) };
}

export interface SiteInput {
  name: string;
  /**
   * Short company name: WonderJobs hosts the careers page at /careers/<slug> and `publicUrl` is ignored.
   * Empty: the company shows the jobs on its own page (`publicUrl`), integrating with the careers API.
   */
  slug?: string;
  publicUrl: string;
  /** One or more addresses, comma-separated, where applications are emailed. Required. */
  notifyEmails: string;
  /** Months applications are kept after their last update. Required. */
  retentionMonths: number;
}

/** The address of a careers page WonderJobs hosts. */
export const hostedUrl = (slug: string) => new URL(`/careers/${slug}`, siteUrl().origin).toString();

async function cleanSite(input: SiteInput, siteId?: string): Promise<Pick<SiteRow, "name" | "public_url" | "notify_emails" | "retention_months" | "slug">> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new HiringError("Name the career site, e.g. WonderID careers.");
  const slug = (input.slug ?? "").trim().toLowerCase() || null;
  let publicUrl: string;
  if (slug) {
    if (!SLUG_PATTERN.test(slug)) throw new HiringError("The short company name can use lower-case letters, numbers and hyphens (2 to 40), like acme or acme-labs.");
    if (RESERVED_SLUGS.has(slug)) throw new HiringError(`jobs.wonderapps.biz/careers/${slug} is taken. Try another short name.`, 409);
    const taken = await sites().one({ slug });
    if (taken && !taken.revoked_at && taken.id !== siteId) throw new HiringError(`jobs.wonderapps.biz/careers/${slug} is taken. Try another short name.`, 409);
    publicUrl = hostedUrl(slug);
  } else {
    publicUrl = input.publicUrl.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(publicUrl) || publicUrl.length > 300) throw new HiringError("Add a short company name for a page hosted by WonderJobs, or your own careers page address (https://…).");
  }
  const emails = parseNotifyEmails(input.notifyEmails ?? "");
  if ("problem" in emails) throw new HiringError(emails.problem);
  if (!Number.isInteger(input.retentionMonths) || input.retentionMonths < 1 || input.retentionMonths > 60) throw new HiringError("Choose how long applications are kept (1 to 60 months).");
  return { name, public_url: publicUrl, notify_emails: emails.emails.join(","), retention_months: input.retentionMonths, slug };
}

/** Creates a site and returns its key — the only time the key is ever shown. */
export async function createSite(s: Session, orgId: string, input: SiteInput): Promise<{ site: CareerSite; key: string }> {
  await requirePermission(s, orgId, "org.manage");
  const fields = await cleanSite(input);
  const key = secret("wjcs");
  const row: SiteRow = { id: id("site"), org_id: orgId, ...fields, key_hash: sha256Hex(key), key_hint: key.slice(-4), created_by: s.tenantId, created_at: now(), revoked_at: null };
  await sites().insert(row);
  return { site: toSite(row), key };
}

/** An Owner changes a site's name, address, applications email or retention; its key stays the same. */
export async function updateSite(s: Session, orgId: string, siteId: string, input: SiteInput): Promise<CareerSite> {
  await requirePermission(s, orgId, "org.manage");
  const fields = await cleanSite(input, siteId);
  const current = await sites().one({ id: siteId, org_id: orgId });
  if (!current || current.revoked_at) throw new HiringError("That career site isn't in this workspace.", 404);
  await sites().update({ id: siteId, org_id: orgId }, fields);
  return toSite({ ...current, ...fields });
}

/** Revoking stops the key at once; the site's jobs disappear from its page and its applications stay. */
export async function revokeSite(s: Session, orgId: string, siteId: string): Promise<void> {
  await requirePermission(s, orgId, "org.manage");
  const n = await sites().update({ id: siteId, org_id: orgId }, { revoked_at: now() });
  if (!n) throw new HiringError("That career site isn't in this workspace.", 404);
  await siteJobs().remove({ site_id: siteId, org_id: orgId });
}

/** Shows a job on a career site, or takes it off. It appears there only while the job is open. */
export async function linkJob(s: Session, orgId: string, siteId: string, jobId: string, on: boolean): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const site = await sites().one({ id: siteId, org_id: orgId });
  if (!site || site.revoked_at) throw new HiringError("That career site isn't in this workspace.", 404);
  if (!(await jobs().one({ id: jobId, org_id: orgId }))) throw new HiringError("That job isn't in this workspace.", 404);
  const existing = await siteJobs().one({ site_id: siteId, job_id: jobId });
  if (on && !existing) await siteJobs().insert({ site_id: siteId, job_id: jobId, org_id: orgId, added_by: s.tenantId, added_at: now() });
  if (!on && existing) await siteJobs().remove({ site_id: siteId, job_id: jobId, org_id: orgId });
}

// ---- the public careers API (site side) ----------------------------------------------------------------------
export interface Site {
  id: string;
  orgId: string;
  name: string;
  publicUrl: string;
  notifyEmails: string[];
  retentionMonths?: number;
  slug?: string;
}

const toPublicSite = (r: SiteRow): Site => ({ id: r.id, orgId: r.org_id, name: r.name, publicUrl: r.public_url, notifyEmails: siteEmails(r), retentionMonths: r.retention_months ?? undefined, slug: r.slug ?? undefined });

/** A careers page WonderJobs hosts, by its short name; null when there is none (or it was revoked). */
export async function hostedSite(slug: string): Promise<(Site & { company: string; verified: boolean }) | null> {
  const s = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(s)) return null;
  const r = await sites().one({ slug: s });
  if (!r || r.revoked_at) return null;
  const org = await orgs().one({ id: r.org_id });
  return org ? { ...toPublicSite(r), company: org.name, verified: !!org.verified } : null;
}

/** The site a key belongs to, or null for an unknown or revoked key. */
export async function siteFromKey(key: string | null | undefined): Promise<Site | null> {
  if (!key || !/^wjcs_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  const r = await sites().one({ key_hash: sha256Hex(key) });
  if (!r || r.revoked_at) return null;
  return toPublicSite(r);
}

export interface PublicJob {
  id: string;
  title: string;
  location: string;
  workMode: EmployerJob["workMode"];
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  description: string;
  skills: string[];
  company: string;
  updatedAt: string;
}

const toPublicJob = (r: JobRow, company: string): PublicJob => ({
  id: r.id,
  title: r.title,
  location: r.location,
  workMode: r.work_mode,
  jobType: r.job_type ?? undefined,
  salaryMin: r.salary_min ?? undefined,
  salaryMax: r.salary_max ?? undefined,
  currency: r.currency,
  description: r.description,
  skills: r.skills ?? [],
  company,
  updatedAt: r.updated_at,
});

/** The open jobs linked to this site, newest first. */
export async function siteJobsList(site: Site): Promise<PublicJob[]> {
  const links = await siteJobs().find({ site_id: site.id, org_id: site.orgId });
  const [rows, org] = await Promise.all([jobs().findIn("id", links.map((l) => l.job_id), { org_id: site.orgId, status: "open" }, { order: "updated_at", desc: true }), orgs().one({ id: site.orgId })]);
  return rows.map((r) => toPublicJob(r, org?.name ?? site.name));
}

async function openSiteJob(site: Site, jobId: string): Promise<JobRow | null> {
  if (!(await siteJobs().one({ site_id: site.id, job_id: jobId, org_id: site.orgId }))) return null;
  const j = await jobs().one({ id: jobId, org_id: site.orgId, status: "open" });
  return j ?? null;
}

export async function siteJob(site: Site, jobId: string): Promise<PublicJob | null> {
  const j = await openSiteJob(site, jobId);
  if (!j) return null;
  const org = await orgs().one({ id: site.orgId });
  return toPublicJob(j, org?.name ?? site.name);
}

/**
 * An applicant applies on the site's page. One application per job and email (a second is a 409). The returned
 * `notify` sends the applicant's confirmation and the hiring team's email; the route runs it after answering.
 */
export async function submitApplication(site: Site, jobId: string, input: ApplicationInput): Promise<{ id: string; notify: () => Promise<void> }> {
  const clean = cleanApplication(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const job = await openSiteJob(site, jobId);
  if (!job) throw new HiringError("This position is no longer open.", 404);
  const v = clean.value;
  if (await apps().one({ job_id: job.id, email: v.email })) throw new HiringError("You've already applied for this position. Your confirmation email has a link to its status.", 409);
  const appId = id("app");
  const at = now();
  const row: AppRow = {
    id: appId,
    org_id: site.orgId,
    job_id: job.id,
    site_id: site.id,
    name: v.name,
    email: v.email,
    phone: v.phone || null,
    location: v.location || null,
    linkedin_url: v.linkedinUrl || null,
    resume_url: v.resumeUrl,
    cover_note: v.coverNote,
    status: "new",
    status_token_hash: sha256Hex(statusToken(appId)),
    consent_at: at,
    created_at: at,
    updated_at: at,
    last_action_at: at,
    reminders_sent: 0,
    last_reminded_at: null,
  };
  await apps().insert(row);
  await record(row, "submitted", "applicant", site.name);
  return { id: row.id, notify: () => notifySubmitted(row, job, site) };
}

// ---- Easy Apply (WonderJobs listings) -----------------------------------------------------------------------
/** The key a résumé copy is encrypted under: the company's, bound to the application (see resume/files.ts). */
const fileOwner = (orgId: string) => `org:${orgId}`;

export interface EasyApplyInput {
  /** The listing as the candidate has it: its id and any it was merged with. One of them is the WonderJobs listing. */
  listingIds: string[];
  name: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  coverNote?: string;
  /** One of the candidate's own uploaded résumé files; a copy goes with the application. */
  resumeFileId: string;
  consent: boolean;
  /** Answers to the job's screening questions, by question id. */
  answers?: unknown;
  /** What the candidate shares from their Career Profile: headline, skills, years of experience. */
  profile?: unknown;
}

/** The WonderJobs listing behind one of the ids a candidate has for a job (it may have been merged with others). */
async function easyApplyListing(listingIds: string[]) {
  const listing = new Set(listingIds.filter((x) => x.startsWith("employers_")));
  return (await openJobs()).find(({ job }) => listing.has(`employers_${hashKey(`employers:${job.id}`)}`)) ?? null;
}

/**
 * What Easy Apply needs to know before it sends (owner, 2026-10-28): the job's screening questions, and whether this
 * account already applied. The browser fills the answers it can from the candidate's own saved answers and asks only
 * for the rest.
 */
export async function easyApplyForm(s: Session, listingIds: string[]): Promise<{ jobTitle: string; company: string; questions: ScreeningQuestion[]; applied: { id: string; status: ApplicationStatus } | null }> {
  if (!s.email) throw new HiringError("Sign in with your email to use Easy Apply.", 403);
  const found = await easyApplyListing(listingIds);
  if (!found) throw new HiringError("This position is no longer open.", 404);
  const mine = await apps().one({ job_id: found.job.id, email: s.email.toLowerCase() });
  return { jobTitle: found.job.title, company: found.org.name, questions: found.job.screening, applied: mine ? { id: mine.id, status: mine.status } : null };
}

/** The applicant takes back an Easy Apply application the company hasn't moved on yet. It shows as withdrawn to the company. */
export async function withdrawEasyApply(s: Session, applicationId: string): Promise<void> {
  if (!s.email) throw new HiringError("Sign in with your email.", 403);
  const a = await apps().one({ id: applicationId, email: s.email.toLowerCase(), via: "wonderjobs" });
  if (!a) throw new HiringError("That application isn't yours.", 404);
  if (!["new", "reviewing"].includes(a.status)) throw new HiringError(`It's already ${APPLICATION_STATUS_LABEL[a.status].toLowerCase()}, so it can't be withdrawn here. Write to the company instead.`, 409);
  const at = now();
  const n = await apps().update({ id: a.id, org_id: a.org_id, status: a.status }, { status: "withdrawn", updated_at: at, last_action_at: at });
  if (!n) throw new HiringError("The company just changed this application. Reload and try again.", 409);
  await record(a, "status:withdrawn", "applicant", "Withdrawn on WonderJobs");
}

/**
 * WonderJobs Easy Apply (owner, 2026-10-23): a signed-in candidate applies to a job a company posted in its
 * WonderJobs workspace, from inside WonderJobs, on their own press. Their account email, the details they
 * confirmed and a copy of the résumé file they chose go into that company's applications — the same table,
 * emails, reminders and decisions as a career site's. One application per job and email (a second is a 409).
 */
export async function easyApply(s: Session, input: EasyApplyInput): Promise<{ id: string; jobTitle: string; company: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to use Easy Apply.", 403);
  const clean = cleanApplication({ ...input, email: s.email, resumeUrl: "" }, { resumeFile: true });
  if ("problem" in clean) throw new HiringError(clean.problem);
  const found = await easyApplyListing(input.listingIds);
  if (!found) throw new HiringError("This position is no longer open.", 404);
  const { job, org } = found;
  const answered = cleanAnswers(job.screening, input.answers);
  if ("problem" in answered) throw new HiringError(answered.problem);
  const file = await resumeFileStore().read(s.tenantId, input.resumeFileId);
  if (!file) throw new HiringError("Choose one of your résumés.", 400);
  const v = clean.value;
  if (await apps().one({ job_id: job.id, email: v.email })) throw new HiringError("You've already applied for this position.", 409);
  const appId = id("app");
  const at = now();
  const row: AppRow = {
    id: appId,
    org_id: org.id,
    job_id: job.id,
    site_id: null,
    name: v.name,
    email: v.email,
    phone: v.phone || null,
    location: v.location || null,
    linkedin_url: v.linkedinUrl || null,
    resume_url: null,
    cover_note: v.coverNote,
    status: "new",
    status_token_hash: sha256Hex(statusToken(appId)),
    consent_at: at,
    created_at: at,
    updated_at: at,
    last_action_at: at,
    reminders_sent: 0,
    last_reminded_at: null,
    via: "wonderjobs",
    answers: job.screening.length ? answered.answers : null,
    profile: cleanApplicantProfile(input.profile) ?? null,
  };
  await apps().insert(row);
  await files().insert({ application_id: appId, org_id: org.id, filename: file.meta.filename, mime: file.meta.mime, ciphertext: encryptFile(fileOwner(org.id), appId, file.bytes), created_at: at });
  await record(row, "submitted", "applicant", "WonderJobs Easy Apply");
  const jobRow = await jobs().one({ id: job.id, org_id: org.id });
  return { id: appId, jobTitle: job.title, company: org.name, notify: () => (jobRow ? notifySubmitted(row, jobRow, undefined) : Promise.resolve()) };
}

/** The résumé sent with an Easy Apply application, for someone in that workspace who may view applications. */
export async function applicationResume(s: Session, orgId: string, applicationId: string): Promise<{ filename: string; mime: string; bytes: Buffer }> {
  await requirePermission(s, orgId, "applications.view");
  const f = await files().one({ application_id: applicationId, org_id: orgId });
  if (!f) throw new HiringError("This application has no résumé file.", 404);
  return { filename: f.filename, mime: f.mime, bytes: decryptFile(fileOwner(orgId), applicationId, f.ciphertext) };
}

export interface ApplicationStatusView {
  status: ApplicationStatus;
  statusLabel: string;
  jobTitle: string;
  company: string;
  appliedAt: string;
  updatedAt: string;
  canWithdraw: boolean;
}

async function byToken(site: Site, token: string): Promise<AppRow | null> {
  if (!/^wjst_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const r = await apps().one({ status_token_hash: sha256Hex(token), org_id: site.orgId });
  return r ?? null;
}

/** What the applicant sees on the site's status page: no notes, no history, nothing about other applicants. */
export async function applicationStatus(site: Site, token: string): Promise<ApplicationStatusView | null> {
  const a = await byToken(site, token);
  if (!a) return null;
  const [job, org] = await Promise.all([jobs().one({ id: a.job_id, org_id: a.org_id }), orgs().one({ id: a.org_id })]);
  return { status: a.status, statusLabel: APPLICATION_STATUS_LABEL[a.status], jobTitle: job?.title ?? "A position", company: org?.name ?? site.name, appliedAt: a.created_at, updatedAt: a.updated_at, canWithdraw: OPEN.includes(a.status) };
}

/** The applicant withdraws from their status link; the hiring team is told. */
export async function withdrawApplication(site: Site, token: string): Promise<{ notify: () => Promise<void> }> {
  const a = await byToken(site, token);
  if (!a) throw new HiringError("Application not found.", 404);
  if (!OPEN.includes(a.status)) throw new HiringError("This application is already closed.", 409);
  await apps().update({ id: a.id, org_id: a.org_id }, { status: "withdrawn", updated_at: now() });
  await record(a, "status:withdrawn", "applicant");
  const job = await jobs().one({ id: a.job_id, org_id: a.org_id });
  return { notify: () => notifyWithdrawn({ ...a, status: "withdrawn" }, job, site) };
}

// ---- applications (workspace side) ---------------------------------------------------------------------------
export interface ApplicationView extends Application {
  jobTitle: string;
  siteName?: string;
  /** The job's screening questions as they are now, to show each answer with its question. */
  questions: Pick<ScreeningQuestion, "id" | "prompt">[];
  /** Must-have questions the answers don't meet (shown to the team; WonderJobs never acts on them). */
  unmet: string[];
  /** The job's skills the applicant shared, and those they didn't; null when either side lists none. */
  fit: { matched: string[]; missing: string[] } | null;
  /** The hiring team's scorecards, tallied. */
  reviews: ReturnType<typeof summarizeReviews>;
}

export async function listApplications(s: Session, orgId: string): Promise<ApplicationView[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await apps().find({ org_id: orgId }, { order: "created_at", desc: true, limit: 500 });
  const ids = rows.map((r) => r.id);
  const [jobRows, siteRows, reviewRows] = await Promise.all([jobs().findIn("id", [...new Set(rows.map((r) => r.job_id))], { org_id: orgId }), sites().find({ org_id: orgId }), ids.length ? reviews().findIn("application_id", ids, { org_id: orgId }) : Promise.resolve([] as ReviewRow[])]);
  return rows.map((r) => {
    const job = jobRows.find((j) => j.id === r.job_id);
    const questions = job?.screening ?? [];
    // Only applications that answered the questions are judged on them: one sent before they were added has no answers.
    const unmet = r.answers ? unmetMustHaves(questions, r.answers) : [];
    return {
      ...toApp(r),
      jobTitle: job?.title ?? "Deleted job",
      siteName: siteRows.find((x) => x.id === r.site_id)?.name,
      questions: questions.map((q) => ({ id: q.id, prompt: q.prompt })),
      unmet,
      fit: applicantFit(job?.skills ?? [], r.profile ?? undefined),
      reviews: summarizeReviews(reviewRows.filter((x) => x.application_id === r.id).map(toReview)),
    };
  });
}

// ---- scorecards and notes (the hiring team's own; never shown to the applicant) ------------------------------
const toReview = (r: ReviewRow): ApplicationReview => ({ id: r.id, applicationId: r.application_id, authorTenant: r.author_tenant, authorName: r.author_name, ...(r.recommendation ? { recommendation: r.recommendation } : {}), note: r.note, createdAt: r.created_at });

export async function listReviews(s: Session, orgId: string, applicationId: string): Promise<ApplicationReview[]> {
  await requirePermission(s, orgId, "applications.view");
  if (!(await apps().one({ id: applicationId, org_id: orgId }))) throw new HiringError("That application isn't in this workspace.", 404);
  return (await reviews().find({ application_id: applicationId, org_id: orgId }, { order: "created_at" })).map(toReview);
}

/** Someone on the hiring team adds their scorecard (a recommendation and/or a note). Recorded in the history too. */
export async function addReview(s: Session, orgId: string, applicationId: string, input: { recommendation?: unknown; note?: unknown }): Promise<ApplicationReview> {
  const me = await requirePermission(s, orgId, "applications.review");
  const a = await apps().one({ id: applicationId, org_id: orgId });
  if (!a) throw new HiringError("That application isn't in this workspace.", 404);
  const clean = cleanReview(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const row: ReviewRow = { id: id("rev"), application_id: a.id, org_id: orgId, author_tenant: s.tenantId, author_name: (me.name || me.email || s.name || s.email || "Team member").slice(0, 80), recommendation: clean.recommendation ?? null, note: clean.note, created_at: now() };
  await reviews().insert(row);
  await record(a, clean.recommendation ? `review:${clean.recommendation}` : "review:note", s.tenantId);
  return toReview(row);
}


export async function applicationHistory(s: Session, orgId: string, applicationId: string): Promise<ApplicationEvent[]> {
  await requirePermission(s, orgId, "applications.view");
  if (!(await apps().one({ id: applicationId, org_id: orgId }))) throw new HiringError("That application isn't in this workspace.", 404);
  return (await events().find({ application_id: applicationId, org_id: orgId }, { order: "at" })).map((e) => ({ event: e.event, actor: e.actor ?? undefined, detail: e.detail ?? undefined, at: e.at }));
}

/**
 * A hiring person moves an application on. The applicant gets an email written for that step, with the person's
 * optional note and next-step link (https only), and replies go to the person. Returns whether the email was sent.
 */
export async function decide(s: Session, orgId: string, applicationId: string, input: { status: ApplicationStatus; note?: string; link?: string }): Promise<{ status: ApplicationStatus; emailed: boolean }> {
  const me = await requirePermission(s, orgId, "applications.decide");
  const a = await apps().one({ id: applicationId, org_id: orgId });
  if (!a) throw new HiringError("That application isn't in this workspace.", 404);
  if (!NEXT_STATUSES[a.status].includes(input.status)) throw new HiringError(`An application that's ${APPLICATION_STATUS_LABEL[a.status].toLowerCase()} can't move to ${APPLICATION_STATUS_LABEL[input.status].toLowerCase()}.`, 409);
  const link = cleanActionLink(input.link);
  if (link === null) throw new HiringError("The next-step link should start with https://");
  const note = (input.note ?? "").trim().slice(0, 2000);
  const at = now();
  // Only the row still in the status we read moves, so two people deciding at once can't both email the applicant.
  const n = await apps().update({ id: a.id, org_id: orgId, status: a.status }, { status: input.status, updated_at: at, last_action_at: at });
  if (!n) throw new HiringError("Someone else just changed this application. Reload and try again.", 409);
  await record(a, `status:${input.status}`, s.tenantId, note || undefined);
  const [job, site] = await Promise.all([jobs().one({ id: a.job_id, org_id: orgId }), a.site_id ? sites().one({ id: a.site_id, org_id: orgId }) : Promise.resolve(undefined)]);
  const emailed = await emailCandidate({ ...a, status: input.status }, job?.title ?? "the position", site, { note, link, replyTo: me.email ?? s.email });
  return { status: input.status, emailed };
}

// ---- reminders -----------------------------------------------------------------------------------------------
/**
 * Daily: for every workspace with applications waiting on it too long (`reminderDue`), one email to each person
 * who can decide, listing them. Each reminder is recorded on the application; one application gets at most
 * `MAX_REMINDERS`. Bounded: the oldest 500 waiting applications per run.
 */
export async function sendDueReminders(at = new Date()): Promise<{ orgs: number; applications: number; emails: number }> {
  const waiting = await apps().findIn("status", ["new", "reviewing"], {}, { order: "last_action_at", limit: 500 });
  const due = waiting.filter((a) => reminderDue({ status: a.status, lastActionAt: a.last_action_at, lastRemindedAt: a.last_reminded_at, remindersSent: a.reminders_sent }, at));
  // One email per workspace and set of recipients (a site's applications address, or the deciders).
  const siteRows = await sites().findIn("id", [...new Set(due.flatMap((a) => (a.site_id ? [a.site_id] : [])))]);
  const groups = new Map<string, { orgId: string; team: string[]; list: AppRow[] }>();
  for (const a of due) {
    const team = await recipientsFor(a.org_id, siteRows.find((x) => x.id === a.site_id && x.org_id === a.org_id));
    const key = `${a.org_id}|${team.join(",")}`;
    const g = groups.get(key) ?? { orgId: a.org_id, team, list: [] };
    g.list.push(a);
    groups.set(key, g);
  }
  let emails = 0;
  for (const { orgId, team, list } of groups.values()) {
    const [org, jobRows] = await Promise.all([orgs().one({ id: orgId }), jobs().findIn("id", [...new Set(list.map((a) => a.job_id))], { org_id: orgId })]);
    const title = (a: AppRow) => jobRows.find((j) => j.id === a.job_id)?.title ?? "a position";
    const mail = renderTeamEmail({
      heading: `${list.length} application${list.length === 1 ? "" : "s"} waiting on you`,
      intro: `These applications to ${org?.name ?? "your company"} have had no decision for ${REMINDER_AFTER_HOURS / 24} days or more. Each applicant is waiting to hear back.`,
      rows: list.map((a) => [`${a.name} — ${title(a)}`, `applied ${a.created_at.slice(0, 10)} · ${APPLICATION_STATUS_LABEL[a.status]}`]),
      button: { label: "Review applications", href: reviewUrl(orgId) },
    });
    let sent = 0;
    for (const to of team) if ((await sendMail({ to, subject: `Reminder: ${list.length} application${list.length === 1 ? "" : "s"} waiting at ${org?.name ?? "your company"}`, ...mail })).sent) sent++;
    emails += sent;
    const stamp = at.toISOString();
    for (const a of list) {
      await apps().update({ id: a.id, org_id: orgId }, { reminders_sent: a.reminders_sent + 1, last_reminded_at: stamp });
      await record(a, "reminder", "system", team.length ? `${sent} of ${team.length} sent` : "no one with an email can decide");
    }
  }
  return { orgs: new Set(due.map((a) => a.org_id)).size, applications: due.length, emails };
}

// ---- retention -----------------------------------------------------------------------------------------------
/**
 * Daily: deletes applications whose last update is older than their career site's retention period (DPDP and
 * GDPR storage limitation). Their history goes with them (foreign-key cascade). Sites without a period set
 * (made before it was required) keep theirs until an Owner sets one. Bounded per run.
 */
export async function purgeExpiredApplications(at = new Date()): Promise<{ deleted: number }> {
  const all = await sites().all({ order: "created_at", limit: 1000 });
  let deleted = 0;
  for (const site of all) {
    if (!site.retention_months) continue;
    const rows = await apps().find({ site_id: site.id, org_id: site.org_id }, { order: "updated_at", limit: 500 });
    for (const a of rows) {
      if (deleteAfter(a.updated_at, site.retention_months) > at) break;
      deleted += await apps().remove({ id: a.id, org_id: site.org_id });
    }
  }
  return { deleted };
}

// ---- email ---------------------------------------------------------------------------------------------------
/** Where a site's application emails go: its applications address, or (older sites) the workspace's deciders. */
async function recipientsFor(orgId: string, site: Pick<SiteRow, "notify_emails"> | Site | undefined): Promise<string[]> {
  const set = site ? ("notifyEmails" in site ? site.notifyEmails : siteEmails(site)) : [];
  return set.length ? set : deciders(orgId);
}

/** Everyone in the workspace whose role lets them decide on applications and who has an email. */
async function deciders(orgId: string): Promise<string[]> {
  const team = await members().find({ org_id: orgId });
  return [...new Set(team.filter((m) => can(m.role, "applications.decide") && m.email).map((m) => m.email!))];
}

/** The workspace's Applications tab (one person may be in several workspaces, so the link names this one). */
const reviewUrl = (orgId: string, applicationId?: string) => new URL(`/app/hiring?org=${encodeURIComponent(orgId)}&tab=applications${applicationId ? `&a=${applicationId}` : ""}`, siteUrl().origin).toString();

function button(b: { label: string; href: string }) {
  const C = EMAIL_COLORS;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 4px"><tr><td bgcolor="${C.brand500}" style="background:${C.brand500};border-radius:10px"><a href="${escapeHtml(b.href)}" style="display:inline-block;padding:11px 18px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(b.label)}</a></td></tr></table>`;
}

/** An email to the hiring team: a heading, a line, a list and one button. */
export function renderTeamEmail(p: { heading: string; intro: string; rows: [string, string][]; button: { label: string; href: string } }): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const rows = p.rows.map(([a, b]) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line}"><div style="font-size:14px;font-weight:600;color:${C.ink}">${escapeHtml(a)}</div><div style="font-size:12px;color:${C.muted}">${escapeHtml(b)}</div></td></tr>`).join("");
  const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(p.heading)}</div><div style="margin:0 0 10px;color:${C.ink2}">${escapeHtml(p.intro)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${button(p.button)}`;
  const bodyText = [p.heading, "", p.intro, "", ...p.rows.map(([a, b]) => `- ${a} (${b})`), "", `${p.button.label}: ${p.button.href}`].join("\n");
  return renderEmailLayout({ origin: siteUrl().origin, preheader: p.intro, bodyHtml, bodyText, reason: "You're getting this because you can decide on applications in this hiring workspace on WonderJobs.", settingsLink: false });
}

/** An email to an applicant, under the company's name. */
export function renderCandidateEmail(p: { orgName: string; careersUrl: string; paragraphs: string[]; note?: string; noteFrom?: string; action?: { label: string; href: string } }): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const paras = p.paragraphs.map((x) => `<p style="margin:0 0 12px">${escapeHtml(x)}</p>`).join("");
  const note = p.note ? `<div style="background:${C.bg};border:1px solid ${C.line};border-left:4px solid ${C.brand500};border-radius:10px;padding:12px 14px;margin:4px 0 12px;white-space:pre-wrap">${escapeHtml(p.note).replace(/\r?\n/g, "<br>")}${p.noteFrom ? `<div style="font-size:12px;color:${C.muted};margin-top:6px">— ${escapeHtml(p.noteFrom)}</div>` : ""}</div>` : "";
  const bodyHtml = `${paras}${note}${p.action ? button(p.action) : ""}`;
  const bodyText = [...p.paragraphs, ...(p.note ? ["", p.note, ...(p.noteFrom ? [`— ${p.noteFrom}`] : [])] : []), ...(p.action ? ["", `${p.action.label}: ${p.action.href}`] : [])].join("\n\n").replace(/\n{3,}/g, "\n\n");
  return renderEmailLayout({
    origin: siteUrl().origin,
    preheader: p.paragraphs[1] ?? p.paragraphs[0] ?? "",
    bodyHtml,
    bodyText,
    reason: `You're getting this because you applied for a position at ${p.orgName}.`,
    settingsLink: false,
    brand: { name: p.orgName, home: p.careersUrl },
  });
}

async function emailCandidate(a: AppRow, jobTitle: string, site: SiteRow | Site | undefined, opts: { note?: string; link?: string; replyTo?: string }): Promise<boolean> {
  const org = await orgs().one({ id: a.org_id });
  const orgName = org?.name ?? "the company";
  const publicUrl = site ? ("public_url" in site ? site.public_url : site.publicUrl) : (org?.website ?? siteUrl().origin);
  const links = careerLinks(publicUrl);
  const statusUrl = links.status(statusToken(a.id));
  const msg = candidateMessage({ status: a.status, name: a.name, jobTitle, orgName, statusUrl, careersUrl: links.careers, actionLink: opts.link, replyTo: opts.replyTo });
  const mail = renderCandidateEmail({ orgName, careersUrl: links.careers, paragraphs: msg.paragraphs, note: opts.note, noteFrom: opts.note ? `${orgName} hiring team` : undefined, action: msg.action });
  const r = await sendMail({ to: a.email, subject: msg.subject, replyTo: opts.replyTo, ...mail });
  await record(a, r.sent ? "email:applicant" : "email:applicant_failed", "system", r.sent ? msg.subject : r.reason);
  return r.sent;
}

async function notifySubmitted(a: AppRow, job: JobRow, site: Site | undefined): Promise<void> {
  try {
    await emailCandidate(a, job.title, site, {});
    const team = await recipientsFor(a.org_id, site);
    const mail = renderTeamEmail({
      heading: `New application: ${a.name}`,
      intro: `${a.name} applied for ${job.title} ${site ? `on ${site.name}` : "with WonderJobs Easy Apply"}.`,
      rows: [
        ["Email", a.email],
        ...(a.phone ? [["Phone", a.phone] as [string, string]] : []),
        ...(a.location ? [["Location", a.location] as [string, string]] : []),
        ["Résumé", a.resume_url ?? (a.via === "wonderjobs" ? "Attached — open the application" : "—")],
        ...(a.linkedin_url ? [["LinkedIn / portfolio", a.linkedin_url] as [string, string]] : []),
        ...(a.cover_note ? [["Note", a.cover_note.slice(0, 600)] as [string, string]] : []),
      ],
      button: { label: "Review the application", href: reviewUrl(a.org_id, a.id) },
    });
    let sent = 0;
    for (const to of team) if ((await sendMail({ to, subject: `New application for ${job.title}: ${a.name}`, replyTo: a.email, ...mail })).sent) sent++;
    await record(a, "email:team", "system", team.length ? `${sent} of ${team.length} sent` : "no one with an email can decide");
  } catch (e) {
    console.error("[careers] submit notifications failed", e instanceof Error ? e.message.slice(0, 200) : e);
  }
}

async function notifyWithdrawn(a: AppRow, job: JobRow | undefined, site: Site): Promise<void> {
  try {
    await emailCandidate(a, job?.title ?? "the position", site, {});
    const team = await recipientsFor(a.org_id, site);
    const mail = renderTeamEmail({ heading: `${a.name} withdrew`, intro: `${a.name} withdrew their application for ${job?.title ?? "a position"}. No action is needed.`, rows: [["Email", a.email]], button: { label: "Open applications", href: reviewUrl(a.org_id, a.id) } });
    for (const to of team) await sendMail({ to, subject: `${a.name} withdrew from ${job?.title ?? "a position"}`, ...mail });
  } catch (e) {
    console.error("[careers] withdraw notifications failed", e instanceof Error ? e.message.slice(0, 200) : e);
  }
}
