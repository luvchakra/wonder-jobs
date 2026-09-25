/**
 * JobsApply server service: the one implementation behind the web routes (cookie session) and the
 * helper routes (session-scoped bearer token). Route handlers only authenticate and translate.
 *
 * Every function takes the tenant explicitly and never touches another tenant's document.
 */
import crypto from "node:crypto";
import type { z } from "zod";
import type { Application } from "@/domain/applications/types";
import type { AutomationLevel, AutomationPolicy } from "@/domain/automation/policy";
import { destinationFor, hostOf } from "@/domain/jobs-apply/destination";
import { progressOf } from "@/domain/jobs-apply/mapper";
import { effectiveFill, fillDecision, fillGate, handoffDecision, type FillDecision } from "@/domain/jobs-apply/policy";
import { findDuplicate } from "@/domain/jobs-apply/readiness";
import * as S from "@/domain/jobs-apply/session";
import { TERMINAL, TransitionError } from "@/domain/jobs-apply/states";
import type { ApplicationForm, JobsApplySession } from "@/domain/jobs-apply/types";
import { buildDocxBytes } from "@/lib/docx";
import { readClientState } from "@/server/clientState";
import type { ConfirmSchema, CreateSchema, EventsSchema, FillPlanSchema, InterventionSchema } from "./schemas";
import { getSession, insertSession, listSessions, mutateSession } from "./store";
import { newNonce, signHelperToken, verifyHelperToken } from "./token";

export interface ApiResult {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): ApiResult => ({ status, body: { error: { code, message, ...extra } } });

const nowIso = () => new Date().toISOString();

/** The automation policy as the candidate saved it. Absent (demo mode, or never saved) → the gates fail closed to "ask". */
async function automationOf(tenantId: string): Promise<{ policy?: AutomationPolicy; level?: AutomationLevel }> {
  try {
    const st = await readClientState<{ policy?: AutomationPolicy; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation");
    return { policy: st?.policy, level: st?.defaultLevel };
  } catch {
    return {};
  }
}

export async function decisionsFor(tenantId: string): Promise<{ fill: FillDecision; handoff: FillDecision }> {
  const a = await automationOf(tenantId);
  return { fill: fillDecision(a.policy, a.level), handoff: handoffDecision(a.policy, a.level) };
}

function wrap<T>(fn: () => T): T | ApiResult {
  try {
    return fn();
  } catch (e) {
    if (e instanceof S.SessionError) return err(e.code === "NOT_FOUND" ? 404 : e.code === "NOT_ALLOWED" ? 409 : 400, e.code, e.message);
    if (e instanceof TransitionError) return err(409, "NOT_ALLOWED", e.message);
    throw e;
  }
}
const isResult = (x: unknown): x is ApiResult => !!x && typeof x === "object" && "status" in x && "body" in x && !("tenantId" in x);

/** Runs a reducer inside the tenant lock; translates domain errors into 4xx without saving. */
async function mutate(tenantId: string, id: string, fn: (s: JobsApplySession) => JobsApplySession): Promise<JobsApplySession | ApiResult> {
  let failure: ApiResult | undefined;
  const out = await mutateSession(tenantId, id, (s) => {
    const r = wrap(() => fn(s));
    if (isResult(r)) {
      failure = r;
      return s;
    }
    return r;
  });
  if (failure) return failure;
  if (!out) return err(404, "NOT_FOUND", "Application session not found.");
  return out;
}

export function view(s: JobsApplySession, decisions?: { fill: FillDecision; handoff: FillDecision }) {
  return { session: S.publicSession(s), progress: progressOf(s), ...(decisions ? { decisions } : {}) };
}

/* ---------------------------------------------------------------- web */

export async function list(tenantId: string): Promise<ApiResult> {
  const sessions = await listSessions(tenantId);
  return ok({ sessions: sessions.map((s) => ({ ...S.publicSession(s), progress: progressOf(s) })) });
}

export async function get(tenantId: string, id: string): Promise<ApiResult> {
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  return ok(view(s, await decisionsFor(tenantId)));
}

export async function create(tenantId: string, input: z.infer<typeof CreateSchema>): Promise<ApiResult> {
  const dest = destinationFor({ applyUrl: input.job.applyUrl, companyDomain: input.job.companyDomain, onEmployerSite: input.job.onEmployerSite, lake: input.job.lake as never });
  if (!dest) return err(400, "INVALID", "This job has no application link Wonder can open.");
  if (input.pack.jobId !== input.job.id) return err(400, "INVALID", "The Application Pack is for a different job.");
  const decisions = await decisionsFor(tenantId);
  if (decisions.handoff === "skip") return err(403, "POLICY_OFF", "Handing off applications is turned off in What Wonder can do. Turn “Hand off application” back on to use JobsApply, or apply from the Application Pack yourself.");

  const sessions = await listSessions(tenantId);
  // Duplicate protection (§57): a submitted application for this opportunity, by job, apply link or employer + title.
  if (!input.acknowledgeDuplicate) {
    const apps = await readClientState<{ applications?: Record<string, Application> }>(tenantId, "wj.applications").catch(() => undefined);
    const jobs = await readClientState<{ jobs?: Record<string, { applyUrl: string; company: string; title: string }> }>(tenantId, "wj.jobs").catch(() => undefined);
    const dup = findDuplicate(input.job, Object.values(apps?.applications ?? {}), jobs?.jobs ?? {}, sessions);
    if (dup) return err(409, "DUPLICATE_APPLICATION", "Wonder found an existing application for this opportunity.", { duplicate: dup });
  }
  // Recovery (§71): an unfinished session for the same job is continued unless the candidate chose Start over.
  const active = sessions.find((s) => s.jobId === input.job.id && !TERMINAL.has(s.status) && s.status !== "SUBMITTED");
  if (active && !input.startOver) return ok({ ...view(active, decisions), resumed: true });
  const now = nowIso();
  if (active && input.startOver) await mutateSession(tenantId, active.id, (s) => S.cancel(s, now, newNonce()));

  const session = S.createSession({ id: `jas_${crypto.randomBytes(9).toString("base64url")}`, tenantId, nonce: newNonce(), destination: dest, pack: input.pack, mode: input.mode, now });
  await insertSession(tenantId, session);
  return ok({ ...view(session, decisions), resumed: false }, 201);
}

export type WebAction = "start" | "stop" | "pause" | "resume" | "cancel" | "mode" | "approve-domain" | "confirm" | "tracked" | "token";
export const WEB_ACTIONS: WebAction[] = ["start", "stop", "pause", "resume", "cancel", "mode", "approve-domain", "confirm", "tracked", "token"];

export async function act(tenantId: string, id: string, action: WebAction, body: Record<string, unknown>): Promise<ApiResult> {
  const now = nowIso();
  if (action === "token") return mintToken(tenantId, id);
  const out = await mutate(tenantId, id, (s) => {
    switch (action) {
      case "start":
        return S.start(s, now, s.status === "READY" || s.stopped ? newNonce() : s.tokenNonce);
      case "stop":
      case "pause":
        return S.stop(s, now, newNonce());
      case "resume":
        return S.resume(s, now);
      case "cancel":
        return S.cancel(s, now, newNonce());
      case "mode":
        return S.setMode(s, body.mode as "guided" | "assisted" | "fill", now);
      case "approve-domain":
        return S.approveDomain(s, String(body.host ?? ""), now);
      case "confirm":
        return S.confirmSubmission(s, (body as z.infer<typeof ConfirmSchema>).answer, now);
      case "tracked":
        return S.markTracked(s, now);
    }
  });
  if (isResult(out)) return out;
  return ok(view(out, await decisionsFor(tenantId)));
}

export async function resolve(tenantId: string, id: string, itemId: string, r: z.infer<typeof InterventionSchema>): Promise<ApiResult> {
  const out = await mutate(tenantId, id, (s) => S.resolveIntervention(s, itemId, r, nowIso()));
  if (isResult(out)) return out;
  return ok(view(out, await decisionsFor(tenantId)));
}

/** A helper token for this session — called by the extension's bridge on WonderJobs' own page (cookie auth). */
async function mintToken(tenantId: string, id: string): Promise<ApiResult> {
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (TERMINAL.has(s.status) || s.status === "SUBMITTED") return err(409, "NOT_ALLOWED", "This application session has ended.");
  if (s.status === "READY" || s.stopped) return err(409, "NOT_STARTED", "Start the application first.");
  try {
    const { token, expiresAt } = signHelperToken({ tenantId, sessionId: s.id, nonce: s.tokenNonce });
    return ok({ token, expiresAt, sessionId: s.id, destination: { url: s.destination.url, domain: s.destination.domain, relatedDomains: s.destination.relatedDomains } });
  } catch {
    return err(503, "NOT_CONFIGURED", "The browser helper isn't configured on this deployment.");
  }
}

/* ------------------------------------------------------------- helper */

export interface HelperCtx {
  tenantId: string;
  session: JobsApplySession;
}

/** Bearer token → the one session it was minted for. Rejects forged, expired and revoked (rotated-nonce) tokens, and ended sessions. */
export async function helperAuth(token: string | null): Promise<HelperCtx | ApiResult> {
  if (!token) return err(401, "UNAUTHORIZED", "Reconnect the helper from WonderJobs.");
  const claims = verifyHelperToken(token);
  if (!claims) return err(401, "UNAUTHORIZED", "The helper's connection expired. Reopen the application from WonderJobs.");
  const session = await getSession(claims.tenantId, claims.sessionId);
  if (!session) return err(401, "UNAUTHORIZED", "Application session not found.");
  if (session.tokenNonce !== claims.nonce) return err(401, "REVOKED", "This helper connection was stopped. Reopen the application from WonderJobs.");
  if (TERMINAL.has(session.status)) return err(401, "REVOKED", "This application session has ended.");
  return { tenantId: claims.tenantId, session };
}

/** What the helper needs to render its panel — labels, statuses and counts; values only through the fill plan. */
export function helperView(s: JobsApplySession, fill: FillDecision) {
  return {
    sessionId: s.id,
    status: s.status,
    failure: s.failure,
    stopped: s.stopped,
    jobTitle: s.jobTitle,
    company: s.company,
    destination: { domain: s.destination.domain, relatedDomains: s.destination.relatedDomains, provider: s.destination.provider },
    approvedDomains: s.approvedDomains,
    fill,
    resume: s.pack.resume ? { filename: s.pack.resume.filename, templateId: s.pack.resume.templateId } : null,
    coverLetter: s.pack.coverLetter ? { filename: s.pack.coverLetter.filename } : null,
    progress: progressOf(s),
    mappings: s.fieldMappings.map((m) => ({ fieldId: m.fieldId, label: m.label, category: m.category, classification: m.classification, status: m.status, required: m.required, reason: m.reason, step: m.step })),
    interventions: s.interventions.map((i) => ({ id: i.id, fieldId: i.fieldId, label: i.label, kind: i.kind, required: i.required, status: i.status })),
  };
}

function plan(s: JobsApplySession, host: string, decision: FillDecision, clicked: boolean, fieldIds?: string[]) {
  const g = fillGate(s, { host, decision, candidateClicked: clicked, fieldIds });
  if (!g.ok) return { allowed: false as const, reason: g.reason, fills: [] };
  return { allowed: true as const, fills: g.mappings.map((m) => ({ fieldId: m.fieldId, ...(m.file ? { file: m.file } : { value: m.value }) })) };
}

async function helperFill(ctx: HelperCtx, s: JobsApplySession = ctx.session): Promise<FillDecision> {
  return effectiveFill((await decisionsFor(ctx.tenantId)).fill, s.mode);
}

export async function helperSession(ctx: HelperCtx): Promise<ApiResult> {
  const fill = await helperFill(ctx);
  return ok(helperView(ctx.session, fill));
}

export async function helperInspect(ctx: HelperCtx, form: ApplicationForm): Promise<ApiResult> {
  const out = await mutate(ctx.tenantId, ctx.session.id, (s) => S.recordInspection(s, form, nowIso()));
  if (isResult(out)) return out;
  const fill = await helperFill(ctx, out);
  // Under an "automatic" policy the plan comes back with the inspection; otherwise the helper waits for the candidate's click.
  const auto = fill === "run" ? plan(out, hostOf(form.url) ?? "", fill, false) : { allowed: false as const, reason: fill === "skip" ? "Filling forms is turned off in What Wonder can do — use guided mode." : "Choose Fill to continue.", fills: [] };
  return ok({ ...helperView(out, fill), plan: auto });
}

export async function helperFillPlan(ctx: HelperCtx, body: z.infer<typeof FillPlanSchema>): Promise<ApiResult> {
  const fill = await helperFill(ctx);
  return ok(plan(ctx.session, body.host.toLowerCase(), fill, body.clicked, body.fieldIds));
}

export async function helperEvents(ctx: HelperCtx, body: z.infer<typeof EventsSchema>): Promise<ApiResult> {
  const now = nowIso();
  const out = await mutate(ctx.tenantId, ctx.session.id, (s0) => {
    let s = s0;
    for (const e of body.events) {
      switch (e.type) {
        case "FIELD_RESULTS":
          s = S.recordFillResults(s, e.results, now);
          break;
        case "NAVIGATION_CHANGED":
          s = S.recordNavigation(s, e.url, now, { passwordField: e.passwordField });
          break;
        case "SUBMIT_CLICKED":
          s = S.recordSubmitClicked(s, now);
          break;
        case "SUBMISSION_DETECTED":
          s = S.recordSubmissionDetected(s, e, now);
          break;
        case "STOP":
          // The candidate pressed Stop in the helper's panel. The nonce rotates, so this token stops working.
          s = S.stop(s, now, newNonce(), "candidate");
          break;
        case "RESUME":
          s = S.resume(s, now);
          break;
        case "APPROVE_DOMAIN":
          s = S.approveDomain(s, e.host, now);
          break;
      }
    }
    return s;
  });
  if (isResult(out)) return out;
  return ok(helperView(out, await helperFill(ctx, out)));
}

/** The file the form asks for, from the snapshot the session started with (§27–§29, §107). */
export async function helperFile(ctx: HelperCtx, kind: "resume" | "cover_letter"): Promise<ApiResult> {
  const s = ctx.session;
  if (s.stopped) return err(409, "STOPPED", "You stopped this application.");
  const mapping = s.fieldMappings.find((m) => m.file === kind && (m.status === "pending" || m.status === "confirmed" || m.status === "failed" || m.status === "filled"));
  if (!mapping) return err(409, "NOT_REQUESTED", "No field on this form is waiting for that document.");
  const f = kind === "resume" ? s.pack.resume : s.pack.coverLetter;
  if (!f) return err(404, "NOT_FOUND", "Your Application Pack has no such document.");
  if (f.source === "template-pdf" && f.base64) return ok({ filename: f.filename, mime: "application/pdf", base64: f.base64 });
  if (f.source === "tailored-docx" && f.markdown) return ok({ filename: f.filename, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: Buffer.from(buildDocxBytes(f.markdown)).toString("base64") });
  return err(410, "GONE", "This document is no longer held for this session. Download it from the Application Pack.");
}
