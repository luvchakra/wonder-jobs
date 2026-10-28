import type { ApplicantProfile } from "./review";
/**
 * Career sites and applications (owner, 2026-10-21). A hiring workspace publishes jobs on outside career pages
 * (WonderID's landing page first, other apps later); applicants apply there, and WonderJobs runs the rest. This
 * file holds the rules both sides share and nothing that touches storage: what an application needs, which
 * status may follow which, what the applicant is told at each step, and when the hiring team is reminded.
 */

export type ApplicationStatus = "new" | "reviewing" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "In review",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not moving forward",
  withdrawn: "Withdrawn",
};

/** What a hiring person may move an application to from each status. Withdrawn is the applicant's alone. */
export const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ["reviewing", "interview", "rejected"],
  reviewing: ["interview", "offer", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["hired", "rejected"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

export const isApplicationStatus = (v: unknown): v is ApplicationStatus => typeof v === "string" && v in APPLICATION_STATUS_LABEL;

/** Statuses still waiting on the company; only these get reminders and can be withdrawn. */
export const WAITING: ApplicationStatus[] = ["new", "reviewing"];
export const OPEN: ApplicationStatus[] = ["new", "reviewing", "interview", "offer"];

export interface CareerSite {
  id: string;
  orgId: string;
  name: string;
  publicUrl: string;
  /** Where its applications are emailed (new ones and reminders). Missing on sites made before 2026-10-21. */
  notifyEmails: string[];
  /** Months its applications are kept after their last update, then deleted. Missing on older sites. */
  retentionMonths?: number;
  /** Set when WonderJobs hosts the page: https://jobs.wonderapps.biz/careers/<slug>. */
  slug?: string;
  /** The key's last four characters, so people can tell keys apart. The key itself is shown once. */
  keyHint: string;
  createdAt: string;
  revokedAt?: string;
}

export interface Application {
  id: string;
  orgId: string;
  jobId: string;
  siteId?: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  /** "wonderjobs": sent with Easy Apply from a WonderJobs listing, with the résumé file attached. */
  via?: "site" | "wonderjobs";
  coverNote: string;
  /** Answers to the job's screening questions, by question id. */
  answers?: Record<string, string>;
  /** What an Easy Apply applicant shared from their Career Profile. */
  profile?: ApplicantProfile;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  lastActionAt: string;
  remindersSent: number;
}

export interface ApplicationEvent {
  event: string;
  actor?: string;
  detail?: string;
  at: string;
}

export interface ApplicationInput {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  coverNote?: string;
  consent: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const httpsUrl = (v: string) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(v);

export type ApplicationField = "name" | "email" | "phone" | "linkedinUrl" | "resumeUrl" | "consent";

/** Trims and bounds an application; returns the first problem, in form order, with the field it belongs to, or the clean value. */
/** `resumeFile`: the résumé comes as a file (WonderJobs Easy Apply), so no résumé link is needed. */
export function cleanApplication(i: ApplicationInput, opts: { resumeFile?: boolean } = {}): { problem: string; field: ApplicationField } | { value: Required<Omit<ApplicationInput, "consent">> } {
  const name = (i.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const email = (i.email ?? "").trim().toLowerCase().slice(0, 200);
  const phone = (i.phone ?? "").trim().slice(0, 40);
  const location = (i.location ?? "").trim().slice(0, 120);
  const linkedinUrl = (i.linkedinUrl ?? "").trim().slice(0, 500);
  const resumeUrl = (i.resumeUrl ?? "").trim().slice(0, 500);
  const coverNote = (i.coverNote ?? "").trim().slice(0, 4000);
  if (name.length < 2) return { problem: "Enter your full name.", field: "name" };
  if (!EMAIL_RE.test(email)) return { problem: "Enter a valid email address.", field: "email" };
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) return { problem: "Enter a valid phone number, or leave it empty.", field: "phone" };
  if (linkedinUrl && !httpsUrl(linkedinUrl)) return { problem: "The LinkedIn or portfolio link should start with https://", field: "linkedinUrl" };
  if (!resumeUrl && !opts.resumeFile) return { problem: "Add a link to your résumé (Google Drive, Dropbox, LinkedIn or your own site).", field: "resumeUrl" };
  if (resumeUrl && !httpsUrl(resumeUrl)) return { problem: "The résumé link should start with https://", field: "resumeUrl" };
  if (!i.consent) return { problem: "Please agree to how your application is handled.", field: "consent" };
  return { value: { name, email, phone, location, linkedinUrl, resumeUrl, coverNote } };
}

/** A next-step link a hiring person adds to a decision (a scheduling page, an offer letter): https only. */
export function cleanActionLink(raw: string | undefined): string | null | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  return httpsUrl(v) && v.length <= 500 ? v : null;
}

export interface CandidateMessage {
  subject: string;
  /** Paragraphs, plain text. */
  paragraphs: string[];
  /** The main button: the hiring person's next-step link, the status page or the open roles. */
  action?: { label: string; href: string };
}

/**
 * What the applicant is told when their application moves, filled in automatically. Every message carries an
 * actionable link: the hiring person's own next-step link when they gave one, otherwise the applicant's status
 * page (or, once it's closed, the other open roles). The hiring person's note, when there is one, is quoted as is.
 */
export function candidateMessage(p: {
  status: ApplicationStatus;
  name: string;
  jobTitle: string;
  orgName: string;
  statusUrl: string;
  careersUrl: string;
  actionLink?: string;
  replyTo?: string;
}): CandidateMessage {
  const first = p.name.split(" ")[0] || p.name;
  const reply = p.replyTo ? " You can reply to this email to reach the hiring team." : "";
  const status = { label: "See your application", href: p.statusUrl };
  switch (p.status) {
    case "reviewing":
      return {
        subject: `Your application for ${p.jobTitle} is being reviewed`,
        paragraphs: [`Hi ${first},`, `Good news: the ${p.orgName} team has started reviewing your application for ${p.jobTitle}. We'll email you as soon as there's a decision.`],
        action: status,
      };
    case "interview":
      return {
        subject: `Interview invitation: ${p.jobTitle} at ${p.orgName}`,
        paragraphs: [
          `Hi ${first},`,
          `Thanks for applying for ${p.jobTitle}. The ${p.orgName} team would like to talk with you.`,
          p.actionLink ? "Use the button below to pick a time that works for you." : `Reply to this email with two or three times that work for you over the next week.`,
        ],
        action: p.actionLink ? { label: "Pick an interview time", href: p.actionLink } : status,
      };
    case "offer":
      return {
        subject: `An offer for ${p.jobTitle} at ${p.orgName}`,
        paragraphs: [`Hi ${first},`, `We're delighted to tell you that ${p.orgName} would like to offer you the ${p.jobTitle} role.`, p.actionLink ? "The details are at the link below." : `The team will share the details with you shortly.${reply}`],
        action: p.actionLink ? { label: "View your offer", href: p.actionLink } : status,
      };
    case "hired":
      return {
        subject: `Welcome to ${p.orgName}`,
        paragraphs: [`Hi ${first},`, `Welcome aboard! Your move to ${p.orgName} as ${p.jobTitle} is confirmed. The team will be in touch about your first day.`],
        action: p.actionLink ? { label: "Your next steps", href: p.actionLink } : status,
      };
    case "rejected":
      return {
        subject: `Update on your application for ${p.jobTitle}`,
        paragraphs: [
          `Hi ${first},`,
          `Thank you for your interest in ${p.jobTitle} at ${p.orgName} and for the time you put into applying. After careful consideration, the team has decided not to move forward with your application.`,
          "We'd be glad to see you apply again for a role that fits; our open positions are at the link below.",
        ],
        action: { label: "See open positions", href: p.careersUrl },
      };
    case "withdrawn":
      return {
        subject: `You withdrew your application for ${p.jobTitle}`,
        paragraphs: [`Hi ${first},`, `Your application for ${p.jobTitle} at ${p.orgName} is withdrawn, and the team won't act on it further.`],
        action: { label: "See open positions", href: p.careersUrl },
      };
    case "new":
    default:
      return {
        subject: `We received your application for ${p.jobTitle}`,
        paragraphs: [`Hi ${first},`, `Thank you for applying for ${p.jobTitle} at ${p.orgName}. The team reviews every application and will email you at each step.`, "You can check where your application stands, or withdraw it, at any time."],
        action: status,
      };
  }
}

/** Hours without action before the hiring team is reminded, and the most reminders one application gets. */
export const REMINDER_AFTER_HOURS = 48;
export const MAX_REMINDERS = 3;

/** True when an application has waited on the company long enough to remind them (again). */
export function reminderDue(a: { status: ApplicationStatus; lastActionAt: string; lastRemindedAt?: string | null; remindersSent: number }, now: Date): boolean {
  if (!WAITING.includes(a.status) || a.remindersSent >= MAX_REMINDERS) return false;
  const after = REMINDER_AFTER_HOURS * 3_600_000;
  if (now.getTime() - Date.parse(a.lastActionAt) < after) return false;
  return !a.lastRemindedAt || now.getTime() - Date.parse(a.lastRemindedAt) >= after;
}

/** Links on an outside careers page, built from the site's own address. */
export const careerLinks = (publicUrl: string) => {
  const base = publicUrl.replace(/\/+$/, "");
  return { careers: base, job: (jobId: string) => `${base}/${encodeURIComponent(jobId)}`, status: (token: string) => `${base}/status?t=${encodeURIComponent(token)}` };
};

/** Retention choices offered for a career site (months after an application's last update). */
export const RETENTION_CHOICES = [6, 12, 24, 36] as const;

/** When an application last updated at `updatedAt` is due for deletion under a retention period. */
export function deleteAfter(updatedAt: string, months: number): Date {
  const d = new Date(updatedAt);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

const ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

/** "a@x.com, b@x.com" → the addresses, lower-cased and de-duplicated; a problem when any is invalid or none given. */
export function parseNotifyEmails(raw: string): { emails: string[] } | { problem: string } {
  const parts = raw.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return { problem: "Add the email address where applications should arrive." };
  const bad = parts.find((x) => !ADDRESS.test(x));
  if (bad) return { problem: `${bad} isn't a valid email address.` };
  const emails = [...new Set(parts)];
  if (emails.length > 5) return { problem: "Use at most five addresses (a team address works well)." };
  return { emails };
}

/** A hosted careers page's short company name: lower-case letters, digits and hyphens, 2 to 40 characters. */
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

/** Addresses under /careers that WonderJobs' own careers page uses, so no hosted page may take them. */
export const RESERVED_SLUGS = new Set(["status", "apply", "jobs", "admin", "api"]);

/** "Acme Corp!" → "acme-corp": what people type, made into a short name (or "" when nothing usable is left). */
export function toSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}
