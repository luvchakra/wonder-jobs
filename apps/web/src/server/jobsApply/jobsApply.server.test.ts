import { beforeAll, describe, expect, it } from "vitest";
import { defaultPolicy } from "@/domain/automation/policy";
import { buildApplicationProfile } from "@/domain/jobs-apply/profile";
import { EMPTY_DNA } from "@/domain/career/types";
import type { ApplicationForm, ApplicationPackSnapshot, JobsApplySession } from "@/domain/jobs-apply/types";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-jobsapply-tokens-0123456789";

type Svc = typeof import("./service");
let svc: Svc;
let state: typeof import("@/server/state");
let token: typeof import("./token");
let schemas: typeof import("./schemas");
let http: typeof import("./http");

beforeAll(async () => {
  svc = await import("./service");
  state = await import("@/server/state");
  token = await import("./token");
  schemas = await import("./schemas");
  http = await import("./http");
});

let seq = 0;
const tenant = () => `tenant_${++seq}_${Math.random().toString(36).slice(2, 8)}`;
const NOW = new Date().toISOString();

const job = (id = "job_gh_1") => ({ id, title: "Senior Director — Identity", company: "Example", applyUrl: "https://boards.greenhouse.io/example/jobs/7", companyDomain: "example.com", onEmployerSite: false });
const pack = (jobId = "job_gh_1"): ApplicationPackSnapshot => ({
  applicationId: "app_1",
  jobId,
  jobTitle: "Senior Director — Identity",
  company: "Example",
  profile: buildApplicationProfile({ ...EMPTY_DNA, name: "Priya Raman", history: { contact: { email: "priya@example.com", phone: "+91 98765 43210" }, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] }, updatedAt: NOW }),
  memory: [],
  resume: { kind: "resume", filename: "Priya_Raman_Resume.pdf", source: "template-pdf", base64: "JVBERi0xLjcKJeLjz9MK", templateId: "executive-v1", templateVersion: "1.0.0", versionId: "sv_1", provenance: "SYSTEM_DERIVED" },
  answers: [],
  version: "pv_1",
  capturedAt: NOW,
});
const form = (over: Partial<ApplicationForm> = {}): ApplicationForm => ({
  url: "https://boards.greenhouse.io/example/jobs/7",
  provider: "greenhouse",
  adapter: "adapter:greenhouse",
  step: 1,
  signals: [],
  fields: [
    { id: "first_name", label: "First Name", type: "text", required: true },
    { id: "email", label: "Email", type: "email", required: true },
    { id: "resume", label: "Resume/CV", type: "file", required: true },
    { id: "wa", label: "Are you legally authorized to work in India?", type: "text", required: true },
  ],
  ...over,
});

async function setAutomation(t: string, fill: "automatic" | "ask" | "off", level: "assist" | "guided" | "autonomous" = "guided", extra: Record<string, string> = {}) {
  await state.stateStore.put(t, "wj.automation", { state: { policy: { ...defaultPolicy(), fill_application: fill, ...extra }, defaultLevel: level }, version: 1 });
}

async function started(t: string, mode: "guided" | "assisted" | "fill" = "assisted") {
  const c = await svc.create(t, { job: job(), pack: pack(), mode });
  expect(c.status).toBe(201);
  const id = (c.body as { session: JobsApplySession }).session.id;
  expect((await svc.act(t, id, "start", {})).status).toBe(200);
  const tok = await svc.act(t, id, "token", {});
  expect(tok.status).toBe(200);
  return { id, token: (tok.body as { token: string }).token };
}

async function helper(tok: string) {
  const ctx = await svc.helperAuth(tok);
  if (!("session" in ctx)) throw new Error(`auth failed: ${JSON.stringify(ctx.body)}`);
  return ctx;
}

describe("JobsApply server", () => {
  it("APPLY-004/005 creates a session and a refresh continues it rather than starting another (§71)", async () => {
    const t = tenant();
    const a = await svc.create(t, { job: job(), pack: pack(), mode: "assisted" });
    expect(a.status).toBe(201);
    const b = await svc.create(t, { job: job(), pack: pack(), mode: "assisted" });
    expect(b.body).toMatchObject({ resumed: true });
    expect((b.body as { session: { id: string } }).session.id).toBe((a.body as { session: { id: string } }).session.id);
    const c = await svc.create(t, { job: job(), pack: pack(), mode: "assisted", startOver: true });
    expect(c.status).toBe(201);
    const listed = (await svc.list(t)).body as { sessions: { status: string }[] };
    expect(listed.sessions.map((s) => s.status).sort()).toEqual(["CANCELLED", "READY"]);
  });

  it("APPLY-006 / GJ5 a submitted application for the same job is a duplicate unless acknowledged", async () => {
    const t = tenant();
    await state.stateStore.put(t, "wj.applications", { state: { applications: { a1: { id: "a1", jobId: "job_gh_1", status: "submitted", appliedAt: "2026-09-18T00:00:00Z", createdAt: NOW, artifacts: [], events: [], followUps: [], submissionKey: "k" } } }, version: 1 });
    const r = await svc.create(t, { job: job(), pack: pack(), mode: "assisted" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "DUPLICATE_APPLICATION", duplicate: { applicationId: "a1", reason: "same job" } } });
    expect((await svc.create(t, { job: job(), pack: pack(), mode: "assisted", acknowledgeDuplicate: true })).status).toBe(201);
  });

  it("refuses to start when 'Hand off application' is turned off (resolveCapability gate)", async () => {
    const t = tenant();
    await setAutomation(t, "ask", "guided", { submit_application: "off" });
    const r = await svc.create(t, { job: job(), pack: pack(), mode: "assisted" });
    expect(r).toMatchObject({ status: 403, body: { error: { code: "POLICY_OFF" } } });
  });

  it("SEC-001 candidate B can't read, act on, or resolve candidate A's session", async () => {
    const a = tenant();
    const b = tenant();
    const { id } = await started(a);
    expect((await svc.get(b, id)).status).toBe(404);
    expect((await svc.act(b, id, "stop", {})).status).toBe(404);
    expect((await svc.act(b, id, "token", {})).status).toBe(404);
    expect((await svc.resolve(b, id, "iv_x", { action: "skip" })).status).toBe(404);
    expect(((await svc.list(b)).body as { sessions: unknown[] }).sessions).toHaveLength(0);
  });

  it("the store never returns a session whose tenantId isn't the reader's, even if one is planted in their document", async () => {
    const a = tenant();
    const b = tenant();
    const { id } = await started(a);
    const doc = (await state.stateStore.get(a, "wj.jobsapply"))!.state as { sessions: Record<string, JobsApplySession> };
    await state.stateStore.put(b, "wj.jobsapply", doc);
    expect((await svc.get(b, id)).status).toBe(404);
  });

  it("wj.jobsapply is server-only: /api/state can neither write nor bulk-read it", () => {
    expect(state.isStateStoreName("wj.jobsapply")).toBe(false);
    expect(state.SERVER_STORES).toContain("wj.jobsapply");
  });

  it("SEC-002/003 helper tokens: forged, expired and revoked tokens are refused; tokens only exist after Start", async () => {
    const t = tenant();
    const c = await svc.create(t, { job: job(), pack: pack(), mode: "assisted" });
    const id = (c.body as { session: { id: string } }).session.id;
    expect((await svc.act(t, id, "token", {})).status).toBe(409);
    await svc.act(t, id, "start", {});
    const tok = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    expect("session" in (await svc.helperAuth(tok))).toBe(true);
    expect(token.verifyHelperToken(tok, Date.now() + 31 * 60_000)).toBeNull();
    const [p, payload, sig] = tok.split(".");
    expect(await svc.helperAuth(`${p}.${payload}.${sig.slice(0, -2)}xx`)).toMatchObject({ status: 401 });
    expect(await svc.helperAuth(null)).toMatchObject({ status: 401 });
    // Stop rotates the nonce: the old token is revoked immediately.
    await svc.act(t, id, "stop", {});
    expect(await svc.helperAuth(tok)).toMatchObject({ status: 401, body: { error: { code: "REVOKED" } } });
    // A fresh Start re-pairs with a new token; Cancel ends it for good.
    await svc.act(t, id, "start", {});
    const tok2 = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    expect("session" in (await svc.helperAuth(tok2))).toBe(true);
    await svc.act(t, id, "cancel", {});
    expect(await svc.helperAuth(tok2)).toMatchObject({ status: 401 });
  });

  it("SEC-008/009, APPLY-047/049 the helper's form payload is structure only — a value, cookie or password is rejected", () => {
    const good = form();
    expect(schemas.FormSchema.safeParse(good).success).toBe(true);
    expect(schemas.FormSchema.safeParse({ ...good, fields: [{ ...good.fields[0], value: "Priya" }] }).success).toBe(false);
    expect(schemas.FormSchema.safeParse({ ...good, cookies: "sid=abc" }).success).toBe(false);
    expect(schemas.FormSchema.safeParse({ ...good, fields: [{ id: "p", label: "Password", type: "password", required: true, password: "hunter2" }] }).success).toBe(false);
    expect(schemas.HelperEventSchema.safeParse({ type: "FIELD_RESULTS", results: [{ fieldId: "otp", ok: true, value: "123456" }] }).success).toBe(false);
  });

  it("fill policy: default 'ask' returns no plan until the candidate clicks Fill; the plan never includes human-only fields", async () => {
    const t = tenant();
    const { token: tok } = await started(t);
    const ins = await svc.helperInspect(await helper(tok), form());
    expect(ins.body).toMatchObject({ fill: "ask", plan: { allowed: false } });
    const plan = await svc.helperFillPlan(await helper(tok), { host: "boards.greenhouse.io", clicked: true });
    const fills = (plan.body as { fills: { fieldId: string; value?: string; file?: string }[] }).fills;
    expect(fills.map((f) => f.fieldId).sort()).toEqual(["email", "first_name", "resume"]);
    expect(fills.find((f) => f.fieldId === "resume")).toEqual({ fieldId: "resume", file: "resume" });
    expect(fills.some((f) => f.fieldId === "wa")).toBe(false);
    expect((await svc.helperFillPlan(await helper(tok), { host: "evil.example.net", clicked: true })).body).toMatchObject({ allowed: false });
  });

  it("fill policy: automatic fills on detection only when the session mode also allows it", async () => {
    const t = tenant();
    await setAutomation(t, "automatic", "guided");
    const auto = await started(t, "fill");
    expect((await svc.helperInspect(await helper(auto.token), form())).body).toMatchObject({ fill: "run", plan: { allowed: true } });
    const t2 = tenant();
    await setAutomation(t2, "automatic", "guided");
    const assisted = await started(t2, "assisted");
    expect((await svc.helperInspect(await helper(assisted.token), form())).body).toMatchObject({ fill: "ask", plan: { allowed: false } });
    const t3 = tenant();
    await setAutomation(t3, "off", "autonomous");
    const off = await started(t3, "fill");
    const r = await svc.helperInspect(await helper(off.token), form());
    expect(r.body).toMatchObject({ fill: "skip", plan: { allowed: false } });
    expect((await svc.helperFillPlan(await helper(off.token), { host: "boards.greenhouse.io", clicked: true })).body).toMatchObject({ allowed: false });
  });

  it("APPLY-054…060 fill → confirmation seen → candidate confirms → tracked; the helper alone never marks it submitted", async () => {
    const t = tenant();
    const { id, token: tok } = await started(t);
    await svc.helperInspect(await helper(tok), form());
    await svc.helperEvents(await helper(tok), { events: [{ type: "FIELD_RESULTS", results: [{ fieldId: "first_name", ok: true }, { fieldId: "email", ok: true }, { fieldId: "resume", ok: true }] }] });
    const file = await svc.helperFile(await helper(tok), "resume");
    expect(file.body).toMatchObject({ filename: "Priya_Raman_Resume.pdf", mime: "application/pdf" });
    const r = await svc.helperEvents(await helper(tok), { events: [{ type: "SUBMIT_CLICKED" }, { type: "SUBMISSION_DETECTED", url: "https://boards.greenhouse.io/example/jobs/7/confirmation", excerpt: "Thank you for applying!", confirmationId: "GH-12345" }] });
    expect(r.body).toMatchObject({ status: "VERIFICATION" });
    const confirmed = await svc.act(t, id, "confirm", { answer: "yes" });
    expect(confirmed.body).toMatchObject({ session: { status: "SUBMITTED", evidence: [{ kind: "confirmation_number", confidence: "VERIFIED", detail: "GH-12345" }, { kind: "candidate_confirmed" }] } });
    expect((await svc.act(t, id, "confirm", { answer: "yes" })).status).toBe(200);
    expect((await svc.act(t, id, "tracked", {})).body).toMatchObject({ session: { status: "TRACKED" } });
    expect(await svc.helperAuth(tok)).toMatchObject({ status: 401 });
  });

  it("SEC-006/007 the stored audit trail holds no candidate values", async () => {
    const t = tenant();
    const { id, token: tok } = await started(t);
    await svc.helperInspect(await helper(tok), form());
    await svc.helperEvents(await helper(tok), { events: [{ type: "FIELD_RESULTS", results: [{ fieldId: "first_name", ok: true }] }] });
    const s = ((await svc.get(t, id)).body as { session: JobsApplySession }).session;
    const log = JSON.stringify(s.audit);
    for (const v of ["Priya", "priya@example.com", "98765", "JVBER"]) expect(log).not.toContain(v);
    expect("tokenNonce" in s).toBe(false);
  });

  it("helper file: refused before any form field asks for it, and after Stop", async () => {
    const t = tenant();
    const { id, token: tok } = await started(t);
    expect((await svc.helperFile(await helper(tok), "resume")).status).toBe(409);
    await svc.helperInspect(await helper(tok), form());
    expect((await svc.helperFile(await helper(tok), "cover_letter")).status).toBe(409);
    await svc.act(t, id, "stop", {});
    expect(await svc.helperAuth(tok)).toMatchObject({ status: 401 });
  });

  it("human-only answers can't be stored through the API", async () => {
    const t = tenant();
    const { id, token: tok } = await started(t);
    await svc.helperInspect(await helper(tok), form());
    expect((await svc.resolve(t, id, "iv_wa", { action: "approve", value: "Yes" })).status).toBe(409);
    expect((await svc.resolve(t, id, "iv_wa", { action: "answered_on_portal" })).status).toBe(200);
  });

  it("GJ7 an unexpected redirect pauses the session; the candidate approves the host (or stops)", async () => {
    const t = tenant();
    const { id, token: tok } = await started(t);
    await svc.helperInspect(await helper(tok), form());
    const paused = await svc.helperEvents(await helper(tok), { events: [{ type: "NAVIGATION_CHANGED", url: "https://login-example-careers.xyz/", passwordField: true }] });
    expect(paused.body).toMatchObject({ status: "PAUSED", failure: "DOMAIN_CHANGED" });
    expect((await svc.helperFillPlan(await helper(tok), { host: "login-example-careers.xyz", clicked: true })).body).toMatchObject({ allowed: false });
    const ok = await svc.act(t, id, "approve-domain", { host: "login-example-careers.xyz" });
    expect(ok.body).toMatchObject({ session: { approvedDomains: ["login-example-careers.xyz"] } });
  });

  it("SEC-012 CSRF: a cross-site or non-JSON write is refused", () => {
    const mk = (headers: Record<string, string>) => new Request("https://jobs.wonderapps.biz/api/jobs-apply/sessions", { method: "POST", headers: { host: "jobs.wonderapps.biz", ...headers } });
    expect(http.sameOrigin(mk({ origin: "https://jobs.wonderapps.biz", "content-type": "application/json" }))).toBe(true);
    expect(http.sameOrigin(mk({ origin: "https://evil.example", "content-type": "application/json" }))).toBe(false);
    expect(http.sameOrigin(mk({ origin: "https://jobs.wonderapps.biz", "content-type": "application/x-www-form-urlencoded" }))).toBe(false);
  });

  it("pack snapshot validation: only a real PDF and safe file names are accepted", () => {
    const p = pack();
    expect(schemas.PackSchema.safeParse(p).success).toBe(true);
    expect(schemas.PackSchema.safeParse({ ...p, resume: { ...p.resume, base64: "PGh0bWw+" } }).success).toBe(false);
    expect(schemas.PackSchema.safeParse({ ...p, resume: { ...p.resume, filename: "../../etc/passwd" } }).success).toBe(false);
  });
});
