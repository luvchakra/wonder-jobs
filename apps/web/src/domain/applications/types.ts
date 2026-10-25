import type { EventReminder } from "@/domain/calendar/reminder";
import type { ApplicationPractice } from "./practice";
import type { CanonicalJob } from "@/domain/jobs/types";
export const APPLICATION_STATUSES = [
  "saved",
  "preparing",
  "ready_for_review",
  "submitted",
  "under_review",
  "interview",
  "rejected",
  "withdrawn",
  "offer",
  "unknown",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info"; group: "in_progress" | "submitted" | "interview" | "outcome" }> = {
  saved: { label: "Saved", tone: "neutral", group: "in_progress" },
  preparing: { label: "Preparing", tone: "warning", group: "in_progress" },
  ready_for_review: { label: "Ready for Review", tone: "info", group: "in_progress" },
  submitted: { label: "Submitted", tone: "success", group: "submitted" },
  under_review: { label: "Under Review", tone: "brand", group: "submitted" },
  interview: { label: "Interview", tone: "brand", group: "interview" },
  rejected: { label: "Rejected", tone: "danger", group: "outcome" },
  withdrawn: { label: "Withdrawn", tone: "neutral", group: "outcome" },
  offer: { label: "Offer", tone: "success", group: "outcome" },
  unknown: { label: "Unknown", tone: "neutral", group: "submitted" },
};

export type ArtifactType = "resume" | "cover_letter" | "answers";

export interface ArtifactVersion {
  id: string;
  createdAt: string;
  provenance: "AI_GENERATED" | "USER_MODIFIED" | "USER_PROVIDED";
  content: string;
  note?: string;
}

export interface ApplicationArtifact {
  id: string;
  applicationId: string;
  type: ArtifactType;
  versions: ArtifactVersion[];
  currentVersionId: string;
}

export type ApplicationEventType =
  | "discovered"
  | "saved"
  | "prepared"
  | "submitted"
  | "follow_up"
  | "recruiter_response"
  | "interview"
  | "outcome"
  | "note";

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  type: ApplicationEventType;
  at: string;
  title: string;
  detail?: string;
}

export interface ApplicationFollowUp {
  id: string;
  applicationId: string;
  dueAt: string;
  kind: "follow_up" | "interview" | "thank_you";
  note: string;
  done: boolean;
  /** The candidate's own reminder for it (Calendar); unset, the default reminder applies. */
  remind?: EventReminder;
}

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  createdAt: string;
  appliedAt?: string;
  nextAction?: string;
  followUpAt?: string;
  artifacts: ApplicationArtifact[];
  events: ApplicationEvent[];
  followUps: ApplicationFollowUp[];
  /** Idempotency key used for any external submission of this application. */
  submissionKey: string;
  /** "Submit for me" for this application (WJ-249): always / never; absent = the account's "Submit applications" default. */
  autoSubmit?: "on" | "off";
  /** The job as it was when the application began, so the application still reads right after the job leaves the search results. */
  job?: ApplicationJob;
  /** Interview practice for this job: test scores, mock interview reviews, the flashcard deck. */
  practice?: ApplicationPractice;
  /** Interview rounds the candidate says they've done for this job (Pipeline → Interview's counter). */
  interviewRounds?: number;
}

/** What an application keeps of its job: the posting's own facts, nothing derived. */
export type ApplicationJob = Pick<CanonicalJob, "title" | "company" | "companyDomain" | "location" | "workMode" | "salaryMin" | "salaryMax" | "currency" | "applyUrl" | "postedAt">;

export function applicationJobOf(j: CanonicalJob): ApplicationJob {
  return { title: j.title, company: j.company, companyDomain: j.companyDomain, location: j.location, workMode: j.workMode, salaryMin: j.salaryMin, salaryMax: j.salaryMax, currency: j.currency, applyUrl: j.applyUrl, postedAt: j.postedAt };
}

/** Event titles the apply page records when it opens the employer's form (Apply with Wonder). */
export const HANDOFF_TITLES = { guided: "Application opened in guided mode", helper: "Application opened with Wonder's browser helper" } as const;

/** The latest time this application was opened on the employer's site through Wonder, if it was. */
export function handedOffAt(a: Pick<Application, "events">): ApplicationEvent | undefined {
  const titles: string[] = Object.values(HANDOFF_TITLES);
  return [...a.events].reverse().find((e) => e.type === "note" && titles.includes(e.title));
}

const SENT: ApplicationStatus[] = ["submitted", "under_review", "interview", "offer"];
const sent = (a: Pick<Application, "status" | "appliedAt" | "events">) => SENT.includes(a.status) || Boolean(a.appliedAt) || a.events.some((e) => e.type === "submitted");
const interviewed = (a: Pick<Application, "status" | "followUps" | "events" | "interviewRounds">) =>
  a.status === "interview" || a.status === "offer" || (a.interviewRounds ?? 0) > 0 || a.followUps.some((f) => f.kind === "interview") || a.events.some((e) => e.type === "interview");

/**
 * The application funnel (Insights): each stage counts every application that reached it — from what happened to it,
 * not only where it is now (one rejected after an interview still reached Interview; one withdrawn before it was
 * sent never reached Applied) — and the Pipeline list opens on the same set (?stage=). A job only saved isn't in the
 * Pipeline, so it isn't counted. `prepared` is kept for Analytics' links.
 */
export const FUNNEL_STAGES: { key: string; label: string; reached: (a: Application) => boolean; insights: boolean }[] = [
  { key: "all", label: "In Pipeline", reached: (a) => a.status !== "saved", insights: true },
  { key: "prepared", label: "Prepared", reached: (a) => a.status === "ready_for_review" || sent(a), insights: false },
  { key: "submitted", label: "Applied", reached: sent, insights: true },
  { key: "interview", label: "Interview", reached: interviewed, insights: true },
  { key: "offer", label: "Offer", reached: (a) => a.status === "offer", insights: true },
];
