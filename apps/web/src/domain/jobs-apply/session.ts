/**
 * The JobsApply session reducer. Every change to a session goes through one of these pure
 * functions, which the server routes call; each one appends an audit entry (§87) that records
 * categories, counts and hosts — never a value the candidate typed or Wonder filled (§88).
 */
import { checkDomain, hostOf, PROVIDER_NAME } from "./destination";
import { mapForm } from "./mapper";
import { assertTransition, TERMINAL, type Actor } from "./states";
import type { ApplicationField, ApplicationForm, ApplicationPackSnapshot, ApplyDestination, ApplyMode, FailureCode, FieldMapping, InterventionItem, JobsApplyAuditEntry, JobsApplyEventType, JobsApplySession, JobsApplyStatus, SubmissionEvidence } from "./types";

const MAX_AUDIT = 250;
const MAX_ANSWER = 5000;

export class SessionError extends Error {
  constructor(
    message: string,
    public code: "INVALID" | "NOT_ALLOWED" | "NOT_FOUND" = "INVALID",
  ) {
    super(message);
  }
}

function audit(s: JobsApplySession, now: string, event: JobsApplyEventType, actor: Actor, detail?: string, where?: string): JobsApplySession {
  const entry: JobsApplyAuditEntry = { at: now, event, actor, ...(detail ? { detail } : {}), ...(where ? { where } : {}) };
  const log = [...s.audit, entry];
  return { ...s, audit: log.length > MAX_AUDIT ? log.slice(log.length - MAX_AUDIT) : log, updatedAt: now };
}

function to(s: JobsApplySession, status: JobsApplyStatus, actor: Actor): JobsApplySession {
  assertTransition(s.status, status, actor);
  return { ...s, status };
}

function assertActive(s: JobsApplySession) {
  if (TERMINAL.has(s.status)) throw new SessionError("This application session has ended.", "NOT_ALLOWED");
}

export function createSession(input: {
  id: string;
  tenantId: string;
  nonce: string;
  destination: ApplyDestination;
  pack: ApplicationPackSnapshot;
  mode: ApplyMode;
  now: string;
}): JobsApplySession {
  const { pack, now } = input;
  const s: JobsApplySession = {
    id: input.id,
    tenantId: input.tenantId,
    applicationId: pack.applicationId,
    jobId: pack.jobId,
    jobTitle: pack.jobTitle,
    company: pack.company,
    idempotencyKey: `jobsapply:${pack.jobId}:${pack.version}`,
    status: "READY",
    mode: input.mode,
    destination: input.destination,
    approvedDomains: [],
    pack,
    formFields: [],
    fieldMappings: [],
    interventions: [],
    approvedAnswers: {},
    evidence: [],
    audit: [],
    tokenNonce: input.nonce,
    stopped: false,
    startedAt: now,
    updatedAt: now,
  };
  return audit(s, now, "SESSION_CREATED", "candidate", `Pack ${pack.version} · ${input.mode} mode${input.destination.provider ? ` · ${PROVIDER_NAME[input.destination.provider]}` : ""}`, input.destination.domain);
}

/** The candidate chose Start: the hand-off opens the employer's page (§4, §66). */
export function start(s: JobsApplySession, now: string, nonce: string): JobsApplySession {
  assertActive(s);
  let n: JobsApplySession = { ...s, tokenNonce: nonce };
  if (n.status === "READY" || n.status === "PREFLIGHT" || n.status === "DRAFT") n = to(to({ ...n, stopped: false, failure: undefined }, "STARTING", "candidate"), "OPENING", "candidate");
  else if (n.status === "PAUSED" || n.stopped) n = audit(resume(n, now, true), now, "SESSION_RESUMED", "candidate");
  else n = audit(n, now, "SESSION_RESUMED", "candidate");
  return audit(n, now, "DESTINATION_OPENED", "candidate", undefined, n.destination.domain);
}

/** Status from what's left to do — used after every change that isn't a pause. */
export function deriveStatus(s: Pick<JobsApplySession, "fieldMappings" | "interventions" | "status">): JobsApplyStatus {
  const pending = s.fieldMappings.filter((m) => (m.status === "pending" || m.status === "confirmed") && (m.value !== undefined || m.file) && m.classification !== "human-only");
  const filled = s.fieldMappings.some((m) => m.status === "filled");
  const open = s.interventions.filter((i) => i.status === "open");
  if (pending.length) return filled ? "FILLING" : "FORM_DETECTED";
  if (open.length) return "WAITING_FOR_USER";
  if (s.fieldMappings.length) return "READY_TO_REVIEW";
  return s.status;
}

/** Merges a fresh mapping with what already happened: a filled field stays filled, a resolved item stays resolved. */
function remap(s: JobsApplySession, now: number): JobsApplySession {
  const { mappings, interventions } = mapForm({ fields: s.formFields }, s.pack, s.approvedAnswers, now);
  const prevM = new Map(s.fieldMappings.map((m) => [m.fieldId, m]));
  const prevI = new Map(s.interventions.map((i) => [i.id, i]));
  const fieldById = new Map(s.formFields.map((f) => [f.id, f]));
  const merged: FieldMapping[] = mappings.map((m) => {
    const p = prevM.get(m.fieldId);
    if (p?.status === "filled" && m.classification !== "human-only") return { ...m, status: "filled" };
    return m;
  });
  const mergedI: InterventionItem[] = interventions.map((iv) => {
    const p = prevI.get(iv.id);
    if (p && p.status !== "open") return { ...iv, status: p.status, resolvedAt: p.resolvedAt, resolution: p.resolution };
    // The candidate answered it directly on the portal: the helper reports only *that* the field has a value.
    if (fieldById.get(iv.fieldId)?.hasValue) return { ...iv, status: "resolved", resolvedAt: new Date(now).toISOString(), resolution: "answered_on_portal" };
    return iv;
  });
  // An intervention the candidate resolved stays visible in the mapping as confirmed/skipped.
  const byField = new Map(mergedI.map((i) => [i.fieldId, i]));
  const final = merged.map((m) => {
    const iv = byField.get(m.fieldId);
    if (m.status === "needs_you" && iv && iv.status !== "open") return { ...m, status: iv.status === "skipped" ? ("skipped" as const) : iv.resolution === "answered_on_portal" ? ("filled" as const) : m.status };
    return m;
  });
  return { ...s, fieldMappings: final, interventions: mergedI };
}

/**
 * The helper read the page (§16). Page-level signals pause or block before anything is mapped;
 * otherwise the step's fields replace that step's previous structure and everything is remapped.
 */
export function recordInspection(s: JobsApplySession, form: ApplicationForm, now: string): JobsApplySession {
  assertActive(s);
  const host = hostOf(form.url) ?? "";
  let n: JobsApplySession = { ...s };
  const fieldsOnPage = form.fields.filter((f) => f.type !== "password" && f.type !== "otp");
  n.form = { adapter: form.adapter, provider: form.provider, url: `${host}${safePath(form.url)}`, step: form.step, stepCount: form.stepCount, fieldCount: fieldsOnPage.length, signals: form.signals };

  if (form.signals.includes("payment")) {
    n = { ...to(n, "BLOCKED", "helper"), failure: "PAYMENT_REQUESTED", resumeStatus: s.status === "BLOCKED" ? s.resumeStatus : s.status };
    return audit(n, now, "PAYMENT_DETECTED", "helper", "Stopped: the page asks for payment details", host);
  }
  if (form.signals.includes("captcha")) {
    n = { ...to(n, "PAUSED", "helper"), failure: "CAPTCHA_REQUIRED", resumeStatus: s.status === "PAUSED" ? s.resumeStatus : s.status };
    return audit(n, now, "CAPTCHA_REQUIRED", "helper", undefined, host);
  }
  if (form.signals.includes("otp")) {
    n = { ...to(n, "PAUSED", "helper"), failure: "MFA_REQUIRED", resumeStatus: s.status === "PAUSED" ? s.resumeStatus : s.status };
    return audit(n, now, "MFA_REQUIRED", "helper", undefined, host);
  }
  const applicationFields = fieldsOnPage.filter((f) => f.type !== "unknown" || f.label);
  if (form.signals.includes("login_form") && applicationFields.length <= 2) {
    n = { ...to(n, "AUTHENTICATION_REQUIRED", "helper"), failure: "AUTH_REQUIRED" };
    return audit(n, now, "AUTH_REQUIRED", "helper", "Sign-in page — the candidate signs in on the employer's site", host);
  }
  if (!fieldsOnPage.length) {
    n = { ...n, failure: "FORM_NOT_FOUND" };
    return audit(n, now, "FORM_ANALYZED", "helper", "No application fields found on this page", host);
  }
  const wasAuth = s.status === "AUTHENTICATION_REQUIRED";
  const step = form.step || 1;
  n.formFields = [...s.formFields.filter((f) => (f.step ?? 1) !== step), ...fieldsOnPage.map((f) => ({ ...f, step }))];
  n = remap({ ...n, failure: undefined }, Date.parse(now));
  const status = deriveStatus(n);
  n = { ...to(n, status, "helper") };
  if (wasAuth) n = audit(n, now, "AUTH_COMPLETED", "helper", undefined, host);
  const stepM = n.fieldMappings.filter((m) => (m.step ?? 1) === step);
  const willFill = stepM.filter((m) => m.status === "pending" && (m.value !== undefined || m.file)).length;
  const needs = n.interventions.filter((i) => i.status === "open" && stepM.some((m) => m.fieldId === i.fieldId)).length;
  n = audit(n, now, "FORM_DETECTED", "helper", `${form.provider ? PROVIDER_NAME[form.provider] : "Generic"} form${form.stepCount ? ` · step ${step} of ${form.stepCount}` : step > 1 ? ` · step ${step}` : ""} · ${fieldsOnPage.length} fields`, host);
  return audit(n, now, "FORM_ANALYZED", "wonder", `${willFill} can be filled · ${needs} need you`);
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

export interface FillResult {
  fieldId: string;
  ok: boolean;
  error?: "not_found" | "rejected" | "file_failed" | "changed";
}

/** What the helper did (§70): filled fields are filled; a failed one goes to "Needs you", nothing restarts. */
export function recordFillResults(s: JobsApplySession, results: FillResult[], now: string): JobsApplySession {
  assertActive(s);
  const byId = new Map(results.map((r) => [r.fieldId, r]));
  let files = 0;
  let failed = 0;
  let filled = 0;
  const mappings = s.fieldMappings.map((m) => {
    const r = byId.get(m.fieldId);
    if (!r || m.classification === "human-only") return m;
    if (r.ok) {
      filled++;
      if (m.file) files++;
      return { ...m, status: "filled" as const };
    }
    failed++;
    return { ...m, status: "failed" as const, reason: r.error === "file_failed" ? "The document didn't attach — attach it yourself." : "Wonder couldn't fill this field safely." };
  });
  const interventions = [...s.interventions];
  for (const m of mappings) {
    if (m.status !== "failed" || interventions.some((i) => i.fieldId === m.fieldId && i.status === "open")) continue;
    interventions.push({ id: `iv_${m.fieldId}`, fieldId: m.fieldId, label: m.label, category: m.category, required: m.required, kind: "unknown_field", status: "open" });
  }
  let n: JobsApplySession = { ...s, fieldMappings: mappings, interventions: dedupeInterventions(interventions) };
  n = { ...to(n, deriveStatus(n), "helper"), failure: failed ? (files && byId.size === 1 ? "FILE_UPLOAD_FAILED" : "ADAPTER_FAILURE") : n.failure === "ADAPTER_FAILURE" || n.failure === "FILE_UPLOAD_FAILED" ? undefined : n.failure };
  if (filled) n = audit(n, now, "FIELD_FILLED", "helper", `${filled} field${filled === 1 ? "" : "s"} filled`);
  if (files) n = audit(n, now, "FILE_UPLOADED", "helper", `${files} document${files === 1 ? "" : "s"} attached`);
  if (failed) n = audit(n, now, "FIELD_FAILED", "helper", `${failed} field${failed === 1 ? "" : "s"} couldn't be filled`);
  if (n.status === "READY_TO_REVIEW") n = audit(n, now, "READY_FOR_REVIEW", "wonder");
  return n;
}

function dedupeInterventions(items: InterventionItem[]): InterventionItem[] {
  const seen = new Map<string, InterventionItem>();
  for (const i of items) seen.set(i.id, i);
  return [...seen.values()];
}

/** `origin` says the text came from Wonder's AI (drafted in the browser), so it's never recorded as the candidate's own words. */
export type Resolution = { action: "approve" | "edit"; value: string; origin?: "ai" | "ai_edited" } | { action: "choose" } | { action: "skip" } | { action: "answered_on_portal" };

/**
 * The candidate resolved a "Needs you" item (§23, §51–§52). Human-only items can only be marked as
 * answered on the portal or skipped — Wonder never stores or fills a value for them.
 */
export function resolveIntervention(s: JobsApplySession, itemId: string, r: Resolution, now: string): JobsApplySession {
  assertActive(s);
  const item = s.interventions.find((i) => i.id === itemId);
  if (!item) throw new SessionError("That item isn't in this application.", "NOT_FOUND");
  const mapping = s.fieldMappings.find((m) => m.fieldId === item.fieldId);
  const humanOnly = item.kind === "answer_on_portal" || mapping?.classification === "human-only";
  let approved = s.approvedAnswers;
  let resolution: string = r.action;
  if (r.action === "approve" || r.action === "edit") {
    if (humanOnly) throw new SessionError("Wonder never fills this question — answer it on the employer's form.", "NOT_ALLOWED");
    const value = r.value.trim();
    if (!value) throw new SessionError("Enter a value, or skip this question.");
    if (value.length > MAX_ANSWER) throw new SessionError("That answer is too long.");
    const fromAi = item.suggestion?.provenance === "AI_GENERATED" || item.suggestion?.provenance === "AI_SUGGESTED" || item.suggestion?.provenance === "USER_MODIFIED";
    const unchanged = item.suggestion && item.suggestion.value.trim() === value;
    // Approving a suggestion unchanged keeps whose words it was (an AI draft stays labelled AI-generated);
    // editing an AI draft makes it the candidate's edit; anything typed from scratch is the candidate's own.
    const sp = item.suggestion?.provenance;
    const provenance = r.origin === "ai" ? "AI_GENERATED" : r.origin === "ai_edited" ? "USER_MODIFIED" : r.action === "approve" && unchanged ? (sp === "AI_GENERATED" || sp === "AI_SUGGESTED" ? "AI_GENERATED" : sp === "USER_MODIFIED" ? "USER_MODIFIED" : "USER_CONFIRMED") : fromAi ? "USER_MODIFIED" : "USER_PROVIDED";
    approved = { ...approved, [item.fieldId]: { value, provenance, at: now } };
    resolution = r.action === "approve" ? "approved" : "edited";
  } else if (r.action === "choose") {
    if (item.kind !== "choose_file_field") throw new SessionError("Only a document field can be chosen.");
    approved = { ...approved, [item.fieldId]: { value: "resume", provenance: "USER_PROVIDED", at: now } };
    resolution = "chosen";
  } else if (r.action === "answered_on_portal") {
    resolution = "answered_on_portal";
  } else {
    resolution = "skipped";
  }
  const interventions = s.interventions.map((i) => {
    if (i.id === itemId) return { ...i, status: r.action === "skip" ? ("skipped" as const) : ("resolved" as const), resolvedAt: now, resolution };
    // Choosing one résumé field settles the others.
    if (r.action === "choose" && i.kind === "choose_file_field" && i.status === "open") return { ...i, status: "resolved" as const, resolvedAt: now, resolution: "other_field_chosen" };
    return i;
  });
  let n = remap({ ...s, approvedAnswers: approved, interventions }, Date.parse(now));
  if (!["PAUSED", "BLOCKED", "AUTHENTICATION_REQUIRED", "OPENING", "SUBMITTING", "VERIFICATION", "UNKNOWN"].includes(n.status)) n = to(n, deriveStatus(n), "candidate");
  return audit(n, now, "INTERVENTION_RESOLVED", "candidate", `${item.category.toLowerCase().replace(/_/g, " ")} · ${resolution.replace(/_/g, " ")}`);
}

/** The page moved (§72). An unexpected host pauses everything until the candidate decides. */
export function recordNavigation(s: JobsApplySession, url: string, now: string, signals: { passwordField?: boolean } = {}): JobsApplySession {
  assertActive(s);
  const host = hostOf(url);
  if (!host) throw new SessionError("Not a web address.");
  const verdict = checkDomain(host, s.destination, s.approvedDomains);
  if (verdict === "unexpected") {
    const n = { ...to(s, "PAUSED", "helper"), failure: "DOMAIN_CHANGED" as FailureCode, resumeStatus: s.status === "PAUSED" ? s.resumeStatus : s.status };
    return audit(n, now, "DOMAIN_CHANGED", "helper", signals.passwordField ? "Unexpected destination asking for a password" : "Unexpected destination", host);
  }
  const lastHost = [...s.audit].reverse().find((a) => a.event === "NAVIGATION_CHANGED" || a.event === "DESTINATION_OPENED")?.where;
  if (lastHost === host) return s;
  return audit(s, now, "NAVIGATION_CHANGED", "helper", verdict === "sso" ? "Signing in with an identity provider" : undefined, host);
}

/** The candidate reviewed an unexpected destination and chose Continue. */
export function approveDomain(s: JobsApplySession, host: string, now: string): JobsApplySession {
  assertActive(s);
  const h = host.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h)) throw new SessionError("Not a host name.");
  const n = { ...s, approvedDomains: [...new Set([...s.approvedDomains, h])] };
  return audit(resume(n, now, true), now, "DOMAIN_APPROVED", "candidate", undefined, h);
}

/** "I've completed it" / Continue after a pause (§33, §69). Filling resumes only through a fresh helper token. */
export function resume(s: JobsApplySession, now: string, silent = false): JobsApplySession {
  assertActive(s);
  const back = s.resumeStatus && !TERMINAL.has(s.resumeStatus) && s.resumeStatus !== "PAUSED" && s.resumeStatus !== "BLOCKED" ? s.resumeStatus : s.fieldMappings.length ? deriveStatus(s) : "OPENING";
  const n = { ...to({ ...s, stopped: false, failure: undefined, resumeStatus: undefined }, back, "candidate") };
  return silent ? n : audit(n, now, "SESSION_RESUMED", "candidate");
}

/** Stop (§69): no further field actions, state kept, the helper's token is revoked by rotating the nonce. */
export function stop(s: JobsApplySession, now: string, nonce: string, actor: Actor = "candidate"): JobsApplySession {
  assertActive(s);
  const filled = s.fieldMappings.filter((m) => m.status === "filled").length;
  const n = { ...to(s, "PAUSED", actor), stopped: true, failure: "USER_CANCELLED" as FailureCode, tokenNonce: nonce, resumeStatus: s.status === "PAUSED" ? s.resumeStatus : s.status };
  return audit(n, now, "SESSION_STOPPED", actor, `${filled} field${filled === 1 ? "" : "s"} were filled before stopping; nothing was submitted`);
}

/** The candidate pressed the employer's own submit button (seen passively by the helper) — not a submission record. */
export function recordSubmitClicked(s: JobsApplySession, now: string): JobsApplySession {
  assertActive(s);
  if (s.status === "SUBMITTED") return s;
  return audit(to(s, "SUBMITTING", "helper"), now, "SUBMISSION_STARTED", "helper", "You pressed the employer's submit button");
}

/** The helper saw a confirmation page (§55). Evidence only: the candidate still confirms. */
export function recordSubmissionDetected(s: JobsApplySession, ev: { url: string; excerpt?: string; confirmationId?: string }, now: string): JobsApplySession {
  assertActive(s);
  if (s.status === "SUBMITTED") return s;
  const host = hostOf(ev.url) ?? "";
  const evidence: SubmissionEvidence = {
    kind: ev.confirmationId ? "confirmation_number" : "confirmation_page",
    confidence: ev.confirmationId ? "VERIFIED" : "LIKELY",
    detail: (ev.confirmationId ?? ev.excerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
    url: `${host}${safePath(ev.url)}`,
    at: now,
  };
  const n = { ...to(s, "VERIFICATION", "helper"), evidence: [...s.evidence, evidence] };
  return audit(n, now, "SUBMISSION_DETECTED", "helper", evidence.kind === "confirmation_number" ? "Confirmation number seen" : "Confirmation page seen", host);
}

/**
 * "Did you submit the application?" (§54). Only "yes" marks it submitted, and only here. Idempotent:
 * confirming twice changes nothing (§108 submission-confirmation-{sessionId}).
 */
export function confirmSubmission(s: JobsApplySession, answer: "yes" | "not_yet" | "unsure", now: string): JobsApplySession {
  if (s.status === "SUBMITTED" || s.status === "TRACKED") {
    if (answer === "yes") return s;
    throw new SessionError("This application is already recorded as submitted.", "NOT_ALLOWED");
  }
  assertActive(s);
  if (answer === "yes") {
    const n = { ...to(s, "SUBMITTED", "candidate"), failure: undefined, completedAt: now, evidence: [...s.evidence, { kind: "candidate_confirmed" as const, confidence: "USER_CONFIRMED" as const, at: now }] };
    return audit(n, now, "SUBMISSION_CONFIRMED", "candidate", s.evidence.length ? "Confirmed by you · Wonder also saw a confirmation page" : "Confirmed by you");
  }
  if (answer === "unsure") {
    const n = { ...to(s, "UNKNOWN", "candidate"), failure: "SUBMISSION_UNKNOWN" as FailureCode, evidence: [...s.evidence, { kind: "candidate_unsure" as const, confidence: "UNKNOWN" as const, at: now }] };
    return audit(n, now, "SUBMISSION_UNSURE", "candidate", "Not sure — Wonder won't retry; check the employer page");
  }
  const back = s.fieldMappings.length ? deriveStatus(s) : "OPENING";
  return audit(to({ ...s, failure: undefined }, back === "READY_TO_REVIEW" || back === "WAITING_FOR_USER" || back === "FORM_DETECTED" || back === "FILLING" ? back : "OPENING", "candidate"), now, "SESSION_RESUMED", "candidate", "Not submitted yet");
}

/** After the tracker recorded it. Drops the résumé bytes; the version ids stay for the record (§107). */
export function markTracked(s: JobsApplySession, now: string): JobsApplySession {
  if (s.status === "TRACKED") return s;
  const n = to(s, "TRACKED", "wonder");
  return audit(stripFiles(n), now, "SESSION_STOPPED", "wonder", "Added to Applications as submitted");
}

export function cancel(s: JobsApplySession, now: string, nonce: string): JobsApplySession {
  if (s.status === "CANCELLED") return s;
  const n = { ...to(s, "CANCELLED", "candidate"), stopped: true, tokenNonce: nonce, completedAt: now };
  return audit(stripFiles(n), now, "SESSION_STOPPED", "candidate", "Cancelled by you; nothing was submitted");
}

export function setMode(s: JobsApplySession, mode: ApplyMode, now: string): JobsApplySession {
  assertActive(s);
  if (s.mode === mode) return s;
  return audit({ ...s, mode }, now, "MODE_CHANGED", "candidate", mode);
}

export function stripFiles(s: JobsApplySession): JobsApplySession {
  const strip = <T extends { base64?: string; markdown?: string } | undefined>(f: T): T => (f ? { ...f, base64: undefined, markdown: undefined } : f);
  return { ...s, pack: { ...s.pack, resume: strip(s.pack.resume), coverLetter: s.pack.coverLetter ? { ...strip(s.pack.coverLetter), text: undefined } : undefined } };
}

/** What the web app sees: everything but the helper nonce and file bytes. */
export function publicSession(s: JobsApplySession): Omit<JobsApplySession, "tokenNonce"> {
  const { tokenNonce: _nonce, ...rest } = stripFiles(s);
  void _nonce;
  return rest;
}

/** Fields in the order the page shows them — for the web review list. */
export function fieldsInOrder(s: Pick<JobsApplySession, "formFields" | "fieldMappings">): { field: ApplicationField; mapping?: FieldMapping }[] {
  const byId = new Map(s.fieldMappings.map((m) => [m.fieldId, m]));
  return s.formFields.map((f) => ({ field: f, mapping: byId.get(f.id) }));
}
