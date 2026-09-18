/**
 * Product analytics (spec §47). Events carry ids and counts only — never API
 * keys, resume text, screening answers or model reasoning.
 */
export type AnalyticsEvent =
  | "account_created"
  | "signed_in"
  | "onboarding_completed"
  | "run_started"
  | "run_paused"
  | "run_resumed"
  | "run_stopped"
  | "workflow_stage_completed"
  | "workflow_waiting_for_user"
  | "job_viewed"
  | "job_saved"
  | "job_rejected"
  | "application_preparation_started"
  | "application_preparation_completed"
  | "application_submitted"
  | "scheduled_run_created"
  | "scheduled_run_completed"
  | "provider_selected"
  | "byok_connected"
  | "byok_removed"
  | "automation_policy_changed";

type Primitive = string | number | boolean | null | undefined;
const FORBIDDEN = /key|secret|token|resume|cover|answer|reasoning|password/i;

const buffer: { event: AnalyticsEvent; props: Record<string, Primitive>; at: string }[] = [];

export function track(event: AnalyticsEvent, props: Record<string, Primitive> = {}) {
  const safe: Record<string, Primitive> = {};
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN.test(k)) continue;
    if (typeof v === "string" && v.length > 120) continue; // never ship free text
    safe[k] = v;
  }
  const entry = { event, props: safe, at: new Date().toISOString() };
  buffer.push(entry);
  if (buffer.length > 200) buffer.shift();
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    console.debug("[analytics]", event, safe);
  }
}

export function recentEvents() {
  return [...buffer];
}
