import type { JobsApplySession } from "./types";

/** How long the apply page waits for the helper to see a form before saying so and offering next steps. */
export const FORM_WAIT_MS = 90_000;

/** Still opening the employer's page, with no form seen yet. */
const OPENING = new Set(["STARTING", "OPENING", "AUTHENTICATION_REQUIRED"]);

/**
 * Whether the apply page should stop waiting for the form: nothing seen from the employer's page for
 * FORM_WAIT_MS since the session last changed (or since the candidate chose to keep waiting).
 */
export function formWait(session: Pick<JobsApplySession, "form" | "status" | "stopped" | "updatedAt">, now: number, keptWaitingAt?: number): "waiting" | "timed_out" | "not_waiting" {
  if (session.form || session.stopped || !OPENING.has(session.status)) return "not_waiting";
  const since = Math.max(Date.parse(session.updatedAt) || 0, keptWaitingAt ?? 0);
  return now - since >= FORM_WAIT_MS ? "timed_out" : "waiting";
}
