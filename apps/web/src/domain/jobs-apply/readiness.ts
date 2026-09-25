/**
 * Preflight (spec §5, §104–§106) and duplicate protection (§57–§58). Reads only what exists: a
 * checklist item is ✓ when the thing is really there, and a blocker names exactly what's missing.
 */
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { hostOf } from "./destination";
import { missingProfileFields } from "./profile";
import type { ApplicationPackSnapshot, JobsApplySession } from "./types";

export interface ChecklistItem {
  key: string;
  label: string;
  state: "ok" | "warn" | "info" | "blocker";
  detail?: string;
}

export interface Readiness {
  ok: boolean;
  items: ChecklistItem[];
  blockers: string[];
}

export function applyReadiness(pack: Pick<ApplicationPackSnapshot, "profile" | "resume" | "coverLetter" | "answers" | "memory">, opts: { resumeValid?: boolean; coverRequired?: boolean } = {}): Readiness {
  const items: ChecklistItem[] = [];
  const missing = missingProfileFields(pack.profile);
  if (pack.resume) items.push({ key: "resume", label: "Résumé selected", state: opts.resumeValid === false ? "blocker" : "ok", detail: pack.resume.filename });
  else items.push({ key: "resume", label: "Résumé", state: "blocker", detail: "Prepare a résumé in the Application Pack first." });
  if (pack.coverLetter) items.push({ key: "cover", label: "Cover letter ready", state: "ok", detail: pack.coverLetter.filename });
  else items.push({ key: "cover", label: "Cover letter", state: opts.coverRequired ? "blocker" : "info", detail: "Optional — include one if the form asks." });
  items.push({ key: "name", label: "Your name", state: pack.profile.fullName ? "ok" : "blocker", detail: pack.profile.fullName ? undefined : "Add your name in Career Profile." });
  items.push({ key: "email", label: "Email", state: pack.profile.email ? "ok" : "blocker", detail: pack.profile.email ? undefined : "Add an email in Career Profile." });
  const contactGaps = missing.filter((m) => m !== "Your name" && m !== "Email");
  items.push({ key: "contact", label: "Contact details", state: contactGaps.length ? "warn" : "ok", detail: contactGaps.length ? `Not in your Career Profile: ${contactGaps.join(", ")}. You'll fill these on the form, or add them to Career Profile first.` : undefined });
  items.push({ key: "answers", label: pack.answers.length ? `${pack.answers.length} prepared answer${pack.answers.length === 1 ? "" : "s"}` : "Prepared answers", state: pack.answers.length ? "ok" : "info", detail: pack.answers.length ? undefined : "None prepared — Wonder can draft answers to questions as the form asks them." });
  items.push({ key: "sensitive", label: "Work authorization, sponsorship and legal questions", state: "info", detail: "Always answered by you on the employer's form — Wonder never assumes them." });
  const blockers = items.filter((i) => i.state === "blocker").map((i) => (i.detail ? `${i.label}: ${i.detail}` : i.label));
  return { ok: blockers.length === 0, items, blockers };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function canonicalUrl(u: string): string {
  const h = hostOf(u);
  if (!h) return u;
  const url = new URL(u);
  return `${h}${url.pathname.replace(/\/(apply|application|thanks)\/?$/, "").replace(/\/$/, "")}`;
}

export interface DuplicateHit {
  kind: "application" | "session";
  applicationId: string;
  appliedAt?: string;
  sessionId?: string;
  reason: "same job" | "same apply link" | "same employer and title";
}

/**
 * An existing *submitted* application for this opportunity (§57–§58): same job id, same canonical
 * apply link, or same employer + title. In-progress applications for the same job are the same
 * application, not a duplicate.
 */
export function findDuplicate(job: Pick<CanonicalJob, "id" | "applyUrl" | "company" | "title">, applications: Application[], jobs: Record<string, Pick<CanonicalJob, "applyUrl" | "company" | "title">>, sessions: Pick<JobsApplySession, "id" | "jobId" | "applicationId" | "status" | "completedAt" | "destination">[] = []): DuplicateHit | null {
  const sent = new Set(["submitted", "under_review", "interview", "offer", "rejected"]);
  const url = job.applyUrl ? canonicalUrl(job.applyUrl) : "";
  for (const a of applications) {
    if (!sent.has(a.status)) continue;
    if (a.jobId === job.id) return { kind: "application", applicationId: a.id, appliedAt: a.appliedAt, reason: "same job" };
    const other = jobs[a.jobId];
    if (!other) continue;
    if (url && other.applyUrl && canonicalUrl(other.applyUrl) === url) return { kind: "application", applicationId: a.id, appliedAt: a.appliedAt, reason: "same apply link" };
    if (norm(other.company) === norm(job.company) && norm(other.title) === norm(job.title)) return { kind: "application", applicationId: a.id, appliedAt: a.appliedAt, reason: "same employer and title" };
  }
  for (const s of sessions) {
    if (s.status !== "SUBMITTED" && s.status !== "TRACKED") continue;
    if (s.jobId === job.id || (url && canonicalUrl(s.destination.url) === url)) return { kind: "session", applicationId: s.applicationId, sessionId: s.id, appliedAt: s.completedAt, reason: s.jobId === job.id ? "same job" : "same apply link" };
  }
  return null;
}
