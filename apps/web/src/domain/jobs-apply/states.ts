/**
 * JobsApply state machine (spec §9–§10). Deliberately small: the invariants that matter are
 *
 *  1. SUBMITTED is reachable only by the candidate's own confirmation — never by Wonder or the helper
 *     (CLAUDE.md: "submitted" is set exclusively by the candidate's own later click; spec §54).
 *  2. TRACKED follows SUBMITTED and nothing else.
 *  3. A terminal session (TRACKED, CANCELLED) never moves again; "Start over" is a new session.
 *  4. Filling is allowed only from an active, un-paused state.
 */
import type { FailureCode, JobsApplyStatus } from "./types";

export type Actor = "candidate" | "wonder" | "helper";

export const TERMINAL: ReadonlySet<JobsApplyStatus> = new Set(["TRACKED", "CANCELLED"]);
/** States in which the helper may put values into the page (§66). */
export const FILLABLE: ReadonlySet<JobsApplyStatus> = new Set(["FORM_DETECTED", "ANALYZING", "FILLING", "WAITING_FOR_USER", "READY_TO_REVIEW", "PARTIAL"]);
/** States where the candidate hasn't begun yet. */
const NOT_STARTED: ReadonlySet<JobsApplyStatus> = new Set(["DRAFT", "PREFLIGHT", "READY"]);
/** States in which the candidate might have submitted on the employer's site. */
const MAY_HAVE_SUBMITTED: ReadonlySet<JobsApplyStatus> = new Set(["OPENING", "AUTHENTICATION_REQUIRED", "FORM_DETECTED", "ANALYZING", "FILLING", "WAITING_FOR_USER", "READY_TO_REVIEW", "SUBMITTING", "VERIFICATION", "PARTIAL", "UNKNOWN", "PAUSED", "BLOCKED", "FAILED", "STARTING"]);

export class TransitionError extends Error {
  constructor(
    public from: JobsApplyStatus,
    public to: JobsApplyStatus,
    reason: string,
  ) {
    super(`JobsApply: ${from} → ${to} not allowed: ${reason}`);
  }
}

export function canTransition(from: JobsApplyStatus, to: JobsApplyStatus, actor: Actor): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };
  if (TERMINAL.has(from)) return { ok: false, reason: "session has ended" };
  if (to === "DRAFT") return { ok: false, reason: "a session never returns to draft" };
  if (to === "SUBMITTED") {
    if (actor !== "candidate") return { ok: false, reason: "only the candidate can say an application was submitted" };
    if (!MAY_HAVE_SUBMITTED.has(from) && from !== "SUBMITTED") return { ok: false, reason: "the application was never opened" };
    return { ok: true };
  }
  if (to === "TRACKED") return from === "SUBMITTED" ? { ok: true } : { ok: false, reason: "only a submitted application is tracked" };
  if (from === "SUBMITTED") return to === "CANCELLED" ? { ok: false, reason: "a submitted application can't be cancelled here" } : { ok: false, reason: "a submitted application only moves to tracked" };
  if (to === "CANCELLED") return actor === "candidate" ? { ok: true } : { ok: false, reason: "only the candidate cancels" };
  if (NOT_STARTED.has(to) && !NOT_STARTED.has(from)) return { ok: false, reason: "a started session can't go back to preflight" };
  return { ok: true };
}

export function assertTransition(from: JobsApplyStatus, to: JobsApplyStatus, actor: Actor): void {
  const r = canTransition(from, to, actor);
  if (!r.ok) throw new TransitionError(from, to, r.reason);
}

/** The five candidate-facing steps the wizard shows (mockup, reworded to what actually happens). */
export type ApplyStep = "method" | "sign_in" | "fill" | "submit" | "track";
export const APPLY_STEPS: { key: ApplyStep; label: string }[] = [
  { key: "method", label: "Method" },
  { key: "sign_in", label: "Sign in" },
  { key: "fill", label: "Fill & review" },
  { key: "submit", label: "Submit on site" },
  { key: "track", label: "Track" },
];

export function stepOf(status: JobsApplyStatus): ApplyStep {
  switch (status) {
    case "DRAFT":
    case "PREFLIGHT":
    case "READY":
      return "method";
    case "STARTING":
    case "OPENING":
    case "AUTHENTICATION_REQUIRED":
      return "sign_in";
    case "FORM_DETECTED":
    case "ANALYZING":
    case "FILLING":
    case "WAITING_FOR_USER":
    case "PARTIAL":
    case "PAUSED":
    case "BLOCKED":
    case "FAILED":
      return "fill";
    case "READY_TO_REVIEW":
    case "SUBMITTING":
    case "VERIFICATION":
    case "UNKNOWN":
      return "submit";
    case "SUBMITTED":
    case "TRACKED":
    case "CANCELLED":
      return "track";
  }
}

/** Candidate-facing label for a status — plain language, never workflow jargon (§12). */
export const STATUS_LABEL: Record<JobsApplyStatus, string> = {
  DRAFT: "Not started",
  PREFLIGHT: "Checking your pack",
  READY: "Ready to start",
  STARTING: "Starting",
  OPENING: "Opened on the employer's site",
  AUTHENTICATION_REQUIRED: "Sign in needed",
  FORM_DETECTED: "Form found",
  ANALYZING: "Reading the form",
  FILLING: "Filling",
  WAITING_FOR_USER: "Needs you",
  READY_TO_REVIEW: "Ready for your review",
  SUBMITTING: "You're submitting",
  SUBMITTED: "Submitted (confirmed by you)",
  VERIFICATION: "Confirm it was submitted",
  TRACKED: "Submitted and tracked",
  BLOCKED: "Blocked",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
  FAILED: "Couldn't continue",
  PARTIAL: "Partly filled",
  UNKNOWN: "Submission not confirmed",
};

/** Plain-language failure explanations (§98–§101). Each says what happened and that nothing was submitted. */
export const FAILURE_COPY: Record<FailureCode, { title: string; body: string }> = {
  AUTH_REQUIRED: { title: "Sign in on the employer's site", body: "The portal needs you to sign in. Do it directly on their page — Wonder never needs your portal password." },
  MFA_REQUIRED: { title: "Sign-in verification required", body: "Complete the verification in the employer portal. Wonder continues once you're signed in." },
  CAPTCHA_REQUIRED: { title: "Verification required", body: "The employer portal is asking you to complete a verification challenge. Complete it in the browser, then continue." },
  FORM_NOT_FOUND: { title: "Wonder couldn't identify this application form yet", body: "You can still use your Application Pack — every value is ready to copy." },
  FIELD_AMBIGUOUS: { title: "Some fields need you", body: "Wonder filled what it could safely identify and left the rest for you." },
  FIELD_UNSUPPORTED: { title: "A field type isn't supported", body: "Wonder left that field for you. Nothing was submitted." },
  FILE_UPLOAD_FAILED: { title: "A document didn't attach", body: "Attach it yourself from the Application Pack. Nothing was submitted." },
  NAVIGATION_FAILED: { title: "The page didn't load", body: "Open the application again. Nothing was submitted." },
  DOMAIN_CHANGED: { title: "Wonder paused this application", body: "The destination changed unexpectedly. Check the address before continuing." },
  PAYMENT_REQUESTED: { title: "Wonder found a payment request", body: "Wonder will not enter payment information. Legitimate employers don't charge to apply — please verify the employer independently." },
  PORTAL_BLOCKED: { title: "The portal blocked automated help", body: "Complete it yourself with your Application Pack. Wonder doesn't work around a site's controls." },
  ADAPTER_FAILURE: { title: "The application page changed", body: "Wonder filled everything it could safely identify. Review the remaining fields." },
  API_UNAUTHORIZED: { title: "No authorized integration", body: "Wonder has no authorized integration for this employer, so it helps in your browser instead." },
  API_VALIDATION_ERROR: { title: "The employer portal rejected a field", body: "Fix the field and try again. Nothing was submitted." },
  DUPLICATE_APPLICATION: { title: "You may have applied already", body: "Wonder found an existing application for this opportunity." },
  SUBMISSION_UNKNOWN: { title: "We aren't sure whether the application was submitted", body: "Please check the employer page. Wonder never retries a submission." },
  NETWORK_ERROR: { title: "Wonder couldn't reach the server", body: "Your progress is saved. Try again in a moment. Nothing was submitted." },
  USER_CANCELLED: { title: "You stopped this application", body: "Fields already entered stay on the employer's page. Nothing was submitted." },
  SESSION_EXPIRED: { title: "The helper's connection expired", body: "Reopen the application from WonderJobs to reconnect. Your progress is saved." },
};
