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
}
