import type { JobsApplyAuditEntry } from "@/domain/jobs-apply/types";

const LABEL: Partial<Record<JobsApplyAuditEntry["event"], string>> = {
  SESSION_CREATED: "Application prepared",
  SESSION_STARTED: "Application started",
  DESTINATION_OPENED: "Opened the employer's application",
  AUTH_REQUIRED: "Sign-in needed",
  AUTH_COMPLETED: "Signed in",
  CAPTCHA_REQUIRED: "Verification challenge — paused",
  MFA_REQUIRED: "Sign-in verification — paused",
  PAYMENT_DETECTED: "Payment request — stopped",
  FORM_DETECTED: "Form detected",
  FORM_ANALYZED: "Form analysed",
  FIELD_FILLED: "Fields filled",
  FIELD_FAILED: "Fields not filled",
  FILE_UPLOADED: "Documents attached",
  INTERVENTION_RESOLVED: "You answered",
  NAVIGATION_CHANGED: "Page changed",
  DOMAIN_CHANGED: "Unexpected destination — paused",
  DOMAIN_APPROVED: "You approved a destination",
  READY_FOR_REVIEW: "Ready for your review",
  SUBMISSION_STARTED: "You pressed the employer's submit button",
  SUBMISSION_DETECTED: "Confirmation seen",
  SUBMISSION_CONFIRMED: "You confirmed it was submitted",
  SUBMISSION_UNSURE: "Submission not confirmed",
  SESSION_RESUMED: "Continued",
  SESSION_STOPPED: "Stopped",
  MODE_CHANGED: "Changed how Wonder helps",
};

/** §87 audit trail as the candidate sees it: who, what, when, where — never a value. */
export function WhatWonderDid({ audit }: { audit: JobsApplyAuditEntry[] }) {
  if (!audit.length) return null;
  return (
    <details className="wj-card mt-4 p-4">
      <summary className="cursor-pointer text-[14px] font-semibold text-ink">What Wonder did ({audit.length})</summary>
      <ol className="mt-3 flex flex-col gap-2">
        {[...audit].reverse().map((a, i) => (
          <li key={`${a.at}-${i}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-[12px]">
            <time className="text-ink-4" dateTime={a.at}>
              {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
            <span className="min-w-0 text-ink-2">
              <span className="font-medium text-ink">{LABEL[a.event] ?? a.event}</span>
              {a.detail ? ` · ${a.detail}` : ""}
              {a.where ? <span className="text-ink-4"> · {a.where}</span> : null}
              <span className="text-ink-4"> · {a.actor === "candidate" ? "you" : a.actor === "helper" ? "browser helper" : "Wonder"}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
