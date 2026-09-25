/**
 * JobsApply domain types (spec §6–§9, §16–§21, §49–§55, §98, §117).
 *
 * JobsApply helps a candidate complete an application on the employer's own site. It fills what
 * the candidate's own facts can fill, stops for what only the candidate can answer, and never
 * submits: "submitted" is recorded only when the candidate says so (CLAUDE.md, spec §10, §67).
 */

/* ------------------------------------------------------------- profile */

/** Where an application value came from (spec §7). Shown next to every value the candidate reviews. */
export type ValueProvenance = "VERIFIED" | "USER_PROVIDED" | "RESUME_IMPORTED" | "LINKEDIN_IMPORTED" | "USER_CONFIRMED" | "AI_DERIVED" | "AI_SUGGESTED";

export interface ApplicationValue<T = string> {
  value: T;
  provenance: ValueProvenance;
  /** 0..1 — how sure Wonder is this is the candidate's current value. */
  confidence: number;
  /** When the candidate last confirmed it (answer memory, §84). */
  confirmedAt?: string;
}

/** The profile keys a form field can be mapped to. */
export const PROFILE_KEYS = ["firstName", "lastName", "fullName", "email", "phone", "city", "country", "location", "linkedinUrl", "portfolioUrl", "githubUrl", "websiteUrl", "currentEmployer", "currentTitle"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type ApplicationProfile = Partial<Record<ProfileKey, ApplicationValue>>;

/* ------------------------------------------------------ answer memory */

/** Answers the candidate gave on an earlier application, remembered with a timestamp (§83–§85). */
export const MEMORY_KEYS = ["salaryExpectation", "noticePeriod", "relocation", "workArrangement", "travel", "availability", "workAuthorization", "sponsorship"] as const;
export type MemoryKey = (typeof MEMORY_KEYS)[number];

export interface RememberedAnswer {
  key: MemoryKey;
  value: string;
  confirmedAt: string;
  source: "USER_PROVIDED";
}

/* -------------------------------------------------------------- pack */

export interface PackFile {
  kind: "resume" | "cover_letter";
  filename: string;
  /** "tailored-docx": built on the server from the application's current Markdown. "template-pdf": a saved résumé rendered from a template. */
  source: "tailored-docx" | "template-pdf";
  /** The DOCX's source text (tailored) — never sent to logs. */
  markdown?: string;
  /** Base64 PDF bytes (template). Dropped from the session once it ends. */
  base64?: string;
  templateId?: string;
  templateVersion?: string;
  /** The artifact version or saved-résumé id this file was built from (§107). */
  versionId: string;
  provenance: "AI_GENERATED" | "USER_MODIFIED" | "USER_PROVIDED" | "SYSTEM_DERIVED";
}

/** A screening answer prepared or approved before the application started. */
export interface PackAnswer {
  id: string;
  question: string;
  answer: string;
  provenance: "AI_GENERATED" | "USER_MODIFIED" | "USER_PROVIDED";
}

/** Snapshot of everything JobsApply may fill, captured when the session starts (§6, §107). */
export interface ApplicationPackSnapshot {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  profile: ApplicationProfile;
  memory: RememberedAnswer[];
  resume?: PackFile;
  coverLetter?: PackFile & { text?: string };
  answers: PackAnswer[];
  /** Hash of the snapshot contents, so a session can say exactly which pack it used. */
  version: string;
  capturedAt: string;
}

/* ------------------------------------------------------ destination */

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters" | "workable" | "teamtailor" | "recruitee" | "personio";

export interface ApplyDestination {
  url: string;
  domain: string;
  type: "employer" | "ats" | "portal" | "aggregator" | "unknown";
  provider?: AtsProvider;
  applicationMethod: "api" | "browser" | "unknown";
  /** Hosts the application may move between without asking (§72). */
  relatedDomains: string[];
}

/* ------------------------------------------------------------- form */

export type FieldType = "text" | "textarea" | "email" | "phone" | "url" | "select" | "radio" | "checkbox" | "date" | "file" | "combobox" | "number" | "password" | "otp" | "unknown";

/** One field as the helper read it off the page — structure only, never a value (§18). */
export interface ApplicationField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: { label: string; value: string }[];
  /** Attribute hints the helper saw (name, id, autocomplete, placeholder, aria-label). */
  hints?: { name?: string; id?: string; autocomplete?: string; placeholder?: string; aria?: string };
  /** Page step it belongs to (multi-step forms, §31). */
  step?: number;
  /** Whether the field currently holds anything — a boolean, never the content. */
  hasValue?: boolean;
}

export interface ApplicationForm {
  url: string;
  provider?: AtsProvider;
  /** "adapter:<provider>" or "generic". */
  adapter: string;
  step: number;
  stepCount?: number;
  fields: ApplicationField[];
  /** Page-level conditions the helper detected (§33–§35, §73–§74). */
  signals: PageSignal[];
}

export type PageSignal = "login_form" | "captcha" | "otp" | "payment" | "unexpected_password" | "suspicious_download";

/* ---------------------------------------------------------- mapping */

export type Classification = "safe" | "confirm" | "human-only" | "unknown";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type QuestionCategory =
  | "IDENTITY"
  | "CONTACT"
  | "LOCATION"
  | "WORK_AUTHORIZATION"
  | "SPONSORSHIP"
  | "EDUCATION"
  | "EXPERIENCE"
  | "SKILLS"
  | "COMPENSATION"
  | "AVAILABILITY"
  | "RELOCATION"
  | "CUSTOM_MOTIVATION"
  | "TECHNICAL"
  | "BEHAVIORAL"
  | "LEGAL"
  | "EEO"
  | "DOCUMENT"
  | "CREDENTIAL"
  | "OTHER";

export type MappingSource = "career-profile" | "application-pack" | "resume" | "answer-memory" | "ai-suggested" | "user-entered";

export interface FieldMapping {
  fieldId: string;
  label: string;
  category: QuestionCategory;
  classification: Classification;
  confidence: Confidence;
  source?: MappingSource;
  /** e.g. "profile.email", "pack.resume", "memory.noticePeriod". */
  sourcePath?: string;
  /** Present only when the helper may put it in the field: safe + HIGH, or confirmed by the candidate. */
  value?: string;
  /** For file fields: which pack file goes here. */
  file?: "resume" | "cover_letter";
  status: "pending" | "filled" | "confirmed" | "skipped" | "failed" | "needs_you";
  /** Why a field wasn't filled — plain language for the candidate. */
  reason?: string;
  required: boolean;
  /** Page step the field is on (multi-step forms). */
  step?: number;
}

/* ----------------------------------------------------- interventions */

export interface InterventionItem {
  id: string;
  fieldId: string;
  label: string;
  category: QuestionCategory;
  required: boolean;
  kind: "answer_on_portal" | "confirm_value" | "choose_file_field" | "draft_answer" | "provide_metric" | "unknown_field";
  /** A value the candidate can accept (remembered answer, pack answer) — never for human-only fields. */
  suggestion?: { value: string; provenance: ValueProvenance | "AI_GENERATED" | "USER_MODIFIED"; lastConfirmedAt?: string };
  status: "open" | "resolved" | "skipped";
  resolvedAt?: string;
  /** How it was resolved — "answered_on_portal", "approved", "edited", "skipped". Never the answer itself. */
  resolution?: string;
}

/* -------------------------------------------------------- evidence */

export type EvidenceConfidence = "VERIFIED" | "LIKELY" | "USER_CONFIRMED" | "UNKNOWN";

export interface SubmissionEvidence {
  kind: "confirmation_page" | "confirmation_number" | "success_url" | "candidate_confirmed" | "candidate_unsure";
  confidence: EvidenceConfidence;
  /** Short excerpt of the confirmation page (≤ 200 chars) or the confirmation id. */
  detail?: string;
  url?: string;
  at: string;
}

/* --------------------------------------------------------- session */

export const JOBS_APPLY_STATUSES = [
  "DRAFT",
  "PREFLIGHT",
  "READY",
  "STARTING",
  "OPENING",
  "AUTHENTICATION_REQUIRED",
  "FORM_DETECTED",
  "ANALYZING",
  "FILLING",
  "WAITING_FOR_USER",
  "READY_TO_REVIEW",
  "SUBMITTING",
  "SUBMITTED",
  "VERIFICATION",
  "TRACKED",
  "BLOCKED",
  "PAUSED",
  "CANCELLED",
  "FAILED",
  "PARTIAL",
  "UNKNOWN",
] as const;
export type JobsApplyStatus = (typeof JOBS_APPLY_STATUSES)[number];

/** Execution modes (§11). "api" exists in the model but no provider has an authorized integration. */
export type ApplyMode = "guided" | "assisted" | "fill";

export const FAILURE_CODES = [
  "AUTH_REQUIRED",
  "MFA_REQUIRED",
  "CAPTCHA_REQUIRED",
  "FORM_NOT_FOUND",
  "FIELD_AMBIGUOUS",
  "FIELD_UNSUPPORTED",
  "FILE_UPLOAD_FAILED",
  "NAVIGATION_FAILED",
  "DOMAIN_CHANGED",
  "PAYMENT_REQUESTED",
  "PORTAL_BLOCKED",
  "ADAPTER_FAILURE",
  "API_UNAUTHORIZED",
  "API_VALIDATION_ERROR",
  "DUPLICATE_APPLICATION",
  "SUBMISSION_UNKNOWN",
  "NETWORK_ERROR",
  "USER_CANCELLED",
  "SESSION_EXPIRED",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export type JobsApplyEventType =
  | "SESSION_CREATED"
  | "SESSION_STARTED"
  | "DESTINATION_OPENED"
  | "HELPER_CONNECTED"
  | "AUTH_REQUIRED"
  | "AUTH_COMPLETED"
  | "CAPTCHA_REQUIRED"
  | "MFA_REQUIRED"
  | "PAYMENT_DETECTED"
  | "FORM_DETECTED"
  | "FORM_ANALYZED"
  | "FIELD_FILLED"
  | "FIELD_FAILED"
  | "FILE_UPLOADED"
  | "INTERVENTION_CREATED"
  | "INTERVENTION_RESOLVED"
  | "NAVIGATION_CHANGED"
  | "DOMAIN_CHANGED"
  | "DOMAIN_APPROVED"
  | "READY_FOR_REVIEW"
  | "SUBMISSION_STARTED"
  | "SUBMISSION_DETECTED"
  | "SUBMISSION_CONFIRMED"
  | "SUBMISSION_UNSURE"
  | "SESSION_RESUMED"
  | "SESSION_PAUSED"
  | "SESSION_STOPPED"
  | "SESSION_FAILED"
  | "MODE_CHANGED";

/** Audit entry (§87): who, what, when, where, result — categories and counts, never a value (§88). */
export interface JobsApplyAuditEntry {
  at: string;
  event: JobsApplyEventType;
  actor: "candidate" | "wonder" | "helper";
  detail?: string;
  /** Host only, never a full URL with query parameters. */
  where?: string;
}

export interface JobsApplySession {
  id: string;
  /** Tenant that owns it — every read and write checks it. */
  tenantId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  /** Stable key: jobsapply:{jobId}:{packVersion} (§108). */
  idempotencyKey: string;
  status: JobsApplyStatus;
  /** Status to go back to when a pause (CAPTCHA, domain check) clears. */
  resumeStatus?: JobsApplyStatus;
  failure?: FailureCode;
  mode: ApplyMode;
  destination: ApplyDestination;
  /** Domains the candidate approved after an unexpected redirect. */
  approvedDomains: string[];
  pack: ApplicationPackSnapshot;
  form?: { adapter: string; provider?: AtsProvider; url: string; step: number; stepCount?: number; fieldCount: number; signals: PageSignal[] };
  /** The structure of every form step seen so far — labels, types, options; never a value. Needed to remap after an answer is approved. */
  formFields: ApplicationField[];
  fieldMappings: FieldMapping[];
  interventions: InterventionItem[];
  /** Approved answers keyed by field id, set by the candidate (§23, §51). */
  approvedAnswers: Record<string, { value: string; provenance: "USER_PROVIDED" | "USER_MODIFIED" | "AI_GENERATED" | "USER_CONFIRMED"; at: string }>;
  evidence: SubmissionEvidence[];
  audit: JobsApplyAuditEntry[];
  /** Rotated on stop/revoke: helper tokens carrying the old nonce stop working (§90). */
  tokenNonce: string;
  stopped: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}
