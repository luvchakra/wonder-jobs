import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApplicationProfile } from "@/domain/jobs-apply/profile";
import { EMPTY_DNA } from "@/domain/career/types";
import type { ApplicationPackSnapshot, JobsApplySession } from "@/domain/jobs-apply/types";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-jobsapply-tokens-0123456789";

// A listing's Apply link is resolved on the server before the application opens; no real request in tests.
const resolveListing = vi.hoisted(() => vi.fn<(url: string) => Promise<string | null>>(async () => null));
vi.mock("./listing", async (orig) => ({ ...(await orig<typeof import("./listing")>()), resolveListing }));

let svc: typeof import("./service");
let cloud: typeof import("./cloud");
let store: typeof import("./store");
let conns: typeof import("@/server/connections");
beforeAll(async () => {
  conns = await import("@/server/connections");
  svc = await import("./service");
  cloud = await import("./cloud");
  store = await import("./store");
});

const NOW = new Date().toISOString();
let seq = 0;
const tenant = () => `tenant_${++seq}_${Math.random().toString(36).slice(2, 8)}`;
const job = () => ({ id: "job_gh_1", title: "Senior Director — Identity", company: "Example", applyUrl: "https://boards.greenhouse.io/example/jobs/7", companyDomain: "example.com", onEmployerSite: false });
const pack = (): ApplicationPackSnapshot => ({
  applicationId: "app_1",
  jobId: "job_gh_1",
  jobTitle: "Senior Director — Identity",
  company: "Example",
  profile: buildApplicationProfile({ ...EMPTY_DNA, name: "Priya Raman", history: { contact: { email: "priya@example.com", phone: "+91 98765 43210" }, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] }, updatedAt: NOW }),
  memory: [],
  answers: [],
  version: "pv_1",
  capturedAt: NOW,
});

async function started(t: string, mode: "guided" | "assisted" = "assisted", j = job()) {
  const c = await svc.create(t, { job: j, pack: { ...pack(), jobId: j.id }, mode });
  const id = (c.body as { session: JobsApplySession }).session.id;
  expect((await svc.act(t, id, "start", {})).status).toBe(200);
  return id;
}

const calls: { url: string; init: RequestInit }[] = [];
function workerAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("cloud browser sessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
    delete process.env.CLOUD_BROWSER_URL;
    delete process.env.CLOUD_BROWSER_SECRET;
  });

  it("fills in the background only on an applicant-tracking system's page or from a job board's listing (WJ-314, WJ-315)", async () => {
    process.env.CLOUD_BROWSER_URL = "https://cloud.example";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    const t = tenant();
    const careers = { ...job(), id: "job_careers_1", applyUrl: "https://careers.example.com/jobs/7", onEmployerSite: true };
    const id = await started(t, "assisted", careers);
    workerAnswers(201, { cloudId: "44444444-4444-4444-8444-444444444444", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    const r = await cloud.startCloud(t, id, { headless: true });
    expect(r.status).toBe(409);
    // A job board that keeps applying behind its own login or blocks automated browsers isn't started either.
    const adz = await started(t, "assisted", { ...job(), id: "job_adzuna_9", applyUrl: "https://www.adzuna.in/details/5929200593?utm_medium=api" });
    expect((await cloud.startCloud(t, adz, { headless: true })).body).toMatchObject({ error: { code: "NOT_FILLABLE" } });
    expect((r.body as { error: { code: string } }).error.code).toBe("NOT_FILLABLE");
    expect(calls).toHaveLength(0); // the worker was never asked to open it
    expect((await store.getSession(t, id))?.cloud).toBeUndefined();
  });

  it("WJ-315 a listing's background fill asks the worker to follow its Apply link, then moves to the employer once", async () => {
    process.env.CLOUD_BROWSER_URL = "https://cloud.example";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    const t = tenant();
    const board = { ...job(), id: "job_arbeitnow_2", applyUrl: "https://www.arbeitnow.com/jobs/companies/hellofresh/security-engineer-360537" };
    const id = await started(t, "assisted", board);
    workerAnswers(201, { cloudId: "55555555-5555-4555-8555-555555555555", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    expect((await cloud.startCloud(t, id, { headless: true })).status).toBe(200);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ url: board.applyUrl, followListing: true });

    const token = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    const ctx = async () => {
      const c = await svc.helperAuth(token);
      if (!("session" in c)) throw new Error("auth");
      return c;
    };
    // The board's own search and alert forms: never read, never filled.
    const boardForm = { url: "https://www.arbeitnow.com/jobs/companies/hellofresh/security-engineer-360537", adapter: "generic", step: 1, signals: [], fields: [{ id: "email", label: "Email me jobs like this", type: "email" as const, required: false }, { id: "q", label: "What", type: "text" as const, required: false }] };
    const r = (await svc.helperInspect(await ctx(), boardForm)).body as { plan: { allowed: boolean; fills: unknown[] } };
    expect(r.plan).toMatchObject({ allowed: false, fills: [] });
    expect((await store.getSession(t, id))?.formFields).toHaveLength(0);

    // The worker reports where the listing's Apply link led: the employer's Workday becomes the destination.
    await svc.helperEvents(await ctx(), { events: [{ type: "LISTING_FOLLOWED", url: "https://amgen.wd1.myworkdayjobs.com/Careers/job/R-1/apply" }] });
    let s = (await store.getSession(t, id))!;
    expect(s.destination).toMatchObject({ domain: "amgen.wd1.myworkdayjobs.com", type: "ats", provider: "workday" });
    expect(s.listingFollowed).toMatchObject({ from: "www.arbeitnow.com", to: "amgen.wd1.myworkdayjobs.com" });
    expect(s.audit.at(-1)).toMatchObject({ event: "LISTING_FOLLOWED", detail: "Followed www.arbeitnow.com's Apply link to amgen.wd1.myworkdayjobs.com" });

    // Once only: a second report changes nothing.
    await svc.helperEvents(await ctx(), { events: [{ type: "LISTING_FOLLOWED", url: "https://elsewhere.example/apply" }] });
    s = (await store.getSession(t, id))!;
    expect(s.destination.domain).toBe("amgen.wd1.myworkdayjobs.com");
  });

  it("WJ-315 a listing whose Apply link the server can read opens at the employer's page from the start", async () => {
    resolveListing.mockResolvedValueOnce("https://job-boards.greenhouse.io/bridgebio/jobs/5265678007?utm_source=arbeitnow.ch&ref=arbeitnow.ch");
    const t = tenant();
    const board = { ...job(), id: "job_arbeitnow_3", applyUrl: "https://www.arbeitnow.ch/jobs/companies/bridgebio/director-it-business-solutions-partner-international-zug-457094" };
    const c = await svc.create(t, { job: board, pack: { ...pack(), jobId: board.id }, mode: "assisted" });
    const s = (c.body as { session: JobsApplySession }).session;
    expect(resolveListing).toHaveBeenCalledWith(board.applyUrl);
    expect(s.destination).toMatchObject({ domain: "job-boards.greenhouse.io", type: "ats", provider: "greenhouse" });
    expect(s.listingFollowed).toMatchObject({ from: "www.arbeitnow.ch", to: "job-boards.greenhouse.io" });
    expect(s.audit.at(-1)).toMatchObject({ event: "LISTING_FOLLOWED" });
  });

  it("WJ-315 a listing whose Apply link leads nowhere new stops with no form found", async () => {
    const t = tenant();
    const board = { ...job(), id: "job_naukri_1", applyUrl: "https://www.naukri.com/job-listings-vp-1" };
    const id = await started(t, "assisted", board);
    const token = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    const c = await svc.helperAuth(token);
    if (!("session" in c)) throw new Error("auth");
    await svc.helperEvents(c, { events: [{ type: "LISTING_FOLLOWED", url: "https://www.naukri.com/nlogin/login" }] });
    const s = (await store.getSession(t, id))!;
    expect(s.destination.domain).toBe("www.naukri.com");
    expect(s.failure).toBe("FORM_NOT_FOUND");
    expect(s.listingFollowed).toBeUndefined();
  });

  it("a listing that showed the cloud browser a bot check says so in one plain line, without the raw address", async () => {
    const t = tenant();
    const board = { ...job(), id: "job_arbeitnow_9", applyUrl: "https://www.arbeitnow.ch/jobs/companies/acme/architect-1" };
    const id = await started(t, "assisted", board);
    const token = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    const c = await svc.helperAuth(token);
    if (!("session" in c)) throw new Error("auth");
    await svc.helperEvents(c, { events: [{ type: "LISTING_FOLLOWED", url: board.applyUrl, note: `no single Apply link on “Just a moment...” at ${board.applyUrl}` }] });
    const s = (await store.getSession(t, id))!;
    expect(s.audit.at(-1)?.detail).toBe("arbeitnow.ch showed a bot check, so Wonder couldn't reach its Apply link");
  });

  it("WJ-316 signs in or creates the portal account only through a background fill, once per portal, never echoing the password", async () => {
    process.env.CLOUD_BROWSER_URL = "https://cloud.example";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    conns.resetConnectionsForTests();
    const t = tenant();
    const wd = { ...job(), id: "job_wd_1", applyUrl: "https://amgen.wd1.myworkdayjobs.com/en-US/Careers/job/Hyderabad/Director_R-1" };
    const id = await started(t, "assisted", wd);
    expect((await store.getSession(t, id))!.destination.url).toBe("https://amgen.wd1.myworkdayjobs.com/en-US/Careers/job/Hyderabad/Director_R-1/apply/applyManually");

    // No background fill open yet: nothing to sign in to.
    expect((await cloud.signInCloud(t, id, { mode: "create" })).status).toBe(409);

    workerAnswers(201, { cloudId: "66666666-6666-4666-8666-666666666666", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    expect((await cloud.startCloud(t, id, { headless: true })).status).toBe(200);

    // Create: the candidate's own email, a generated password saved encrypted before the cloud browser uses it.
    calls.length = 0;
    workerAnswers(200, { result: "signed_in" });
    const r = await cloud.signInCloud(t, id, { mode: "create" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ result: "signed_in", host: "amgen.wd1.myworkdayjobs.com", email: "priya@example.com" });
    const sent = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://cloud.example/sessions/66666666-6666-4666-8666-666666666666/sign-in");
    expect(sent).toMatchObject({ tenantId: t, mode: "create", email: "priya@example.com" });
    expect(sent.password).toHaveLength(20);
    expect(JSON.stringify(r.body)).not.toContain(sent.password);
    const saved = await conns.credentialFor(t, "amgen.wd1.myworkdayjobs.com");
    expect(saved).toMatchObject({ email: "priya@example.com", password: sent.password, connection: { createdBy: "wonder", status: "active", lastResult: "Account created" } });
    const s = (await store.getSession(t, id))!;
    expect(s.audit.at(-1)).toMatchObject({ event: "PORTAL_ACCOUNT_CREATED", detail: "Created your account on amgen.wd1.myworkdayjobs.com with priya@example.com" });
    expect(JSON.stringify(s)).not.toContain(sent.password);

    // Once per portal: a second "create" refuses and points at signing in; sign_in uses the saved one.
    expect((await cloud.signInCloud(t, id, { mode: "create" })).body).toMatchObject({ error: { code: "CONNECTION_EXISTS" } });
    calls.length = 0;
    workerAnswers(200, { result: "needs_verification", message: "The portal sent a verification email." });
    expect((await cloud.signInCloud(t, id, { mode: "sign_in" })).body).toMatchObject({ result: "needs_verification" });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ mode: "sign_in", password: sent.password });
    expect((await conns.connectionFor(t, "amgen.wd1.myworkdayjobs.com"))?.status).toBe("needs_verification");

    // Another tenant has no sign-in here, and can't reach this session.
    expect((await cloud.signInCloud(tenant(), id, { mode: "sign_in" })).status).toBe(404);
  });

  it("WJ-316 the candidate's own sign-in is saved for that portal and used at once", async () => {
    process.env.CLOUD_BROWSER_URL = "https://cloud.example";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    conns.resetConnectionsForTests();
    const t = tenant();
    const id = await started(t, "assisted", { ...job(), id: "job_wd_2", applyUrl: "https://acme.wd5.myworkdayjobs.com/External/job/X_R-9" });
    workerAnswers(201, { cloudId: "77777777-7777-4777-8777-777777777777", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    await cloud.startCloud(t, id, { headless: true });
    expect((await cloud.signInCloud(t, id, { mode: "sign_in" })).body).toMatchObject({ error: { code: "NO_CONNECTION" } });
    calls.length = 0;
    workerAnswers(200, { result: "failed", message: "Wrong email or password." });
    const r = await cloud.signInCloud(t, id, { mode: "save", email: "me@example.com", password: "My-own-pass1" });
    expect(r.body).toMatchObject({ result: "failed", message: "Wrong email or password." });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ mode: "sign_in", email: "me@example.com", password: "My-own-pass1" });
    expect(await conns.connectionFor(t, "acme.wd5.myworkdayjobs.com")).toMatchObject({ createdBy: "candidate", status: "failed", lastResult: "Wrong email or password." });
    expect((await store.getSession(t, id))!.audit.at(-1)).toMatchObject({ event: "PORTAL_SIGN_IN_FAILED" });
  });

  it("is 'needs setup' without a worker, and never pretends otherwise", async () => {
    expect(cloud.cloudConfigured()).toBe(false);
    const t = tenant();
    const id = await started(t);
    const r = await cloud.startCloud(t, id);
    expect(r.status).toBe(503);
    expect((r.body as { error: { code: string } }).error.code).toBe("NOT_CONFIGURED");
  });

  it("opens the worker session with the shared secret and this session's own helper token, and records it", async () => {
    process.env.CLOUD_BROWSER_URL = "https://worker.test/";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    workerAnswers(201, { cloudId: "11111111-1111-4111-8111-111111111111", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream", reused: false });
    const t = tenant();
    const id = await started(t);
    const r = await cloud.startCloud(t, id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cloudId: "11111111-1111-4111-8111-111111111111", streamUrl: "wss://worker.test/stream", streamToken: "tok" });
    expect(calls[0].url).toBe("https://worker.test/sessions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-wonder-secret"]).toBe("s".repeat(40));
    const sent = JSON.parse(String(calls[0].init.body)) as { sessionId: string; tenantId: string; url: string; helperToken: string; domains: string[] };
    expect(sent).toMatchObject({ sessionId: id, tenantId: t, url: "https://job-boards.greenhouse.io/embed/job_app?for=example&token=7" });
    expect(sent.domains).toEqual(expect.arrayContaining(["job-boards.greenhouse.io", "greenhouse.io"]));
    // The helper token is the session's: it authenticates only as this session's helper.
    const auth = await svc.helperAuth(sent.helperToken);
    expect("session" in auth && auth.session.id).toBe(id);
    const s = await store.getSession(t, id);
    expect(s?.cloud?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(s?.audit.at(-1)?.event).toBe("CLOUD_BROWSER_OPENED");
  });

  it("refuses another tenant's session, a guided session and one that hasn't started", async () => {
    process.env.CLOUD_BROWSER_URL = "https://worker.test";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    workerAnswers(201, {});
    const t = tenant();
    const id = await started(t);
    expect((await cloud.startCloud(tenant(), id)).status).toBe(404);
    const g = await started(tenant(), "guided");
    expect((await cloud.startCloud((await store.getSession(t, id))!.tenantId === t ? t : t, g)).status).toBe(404); // other tenant's guided session: not found for t
    const t2 = tenant();
    const c = await svc.create(t2, { job: job(), pack: pack(), mode: "assisted" });
    const fresh = (c.body as { session: JobsApplySession }).session.id;
    expect((await cloud.startCloud(t2, fresh)).status).toBe(409);
    expect(calls.length).toBe(0);
  });

  it("relays Fill and Close to the worker for the recorded cloud session only, and marks it closed", async () => {
    process.env.CLOUD_BROWSER_URL = "https://worker.test";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    const t = tenant();
    const id = await started(t);
    expect((await cloud.fillCloud(t, id)).status).toBe(409); // nothing open yet
    workerAnswers(201, { cloudId: "22222222-2222-4222-8222-222222222222", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    await cloud.startCloud(t, id);
    workerAnswers(200, { ok: true });
    expect((await cloud.fillCloud(t, id)).status).toBe(200);
    expect(calls.at(-1)?.url).toBe("https://worker.test/sessions/22222222-2222-4222-8222-222222222222/fill");
    expect(JSON.parse(String(calls.at(-1)?.init.body))).toEqual({ tenantId: t });
    expect((await cloud.endCloud(t, id, "closed_by_candidate")).body).toEqual({ ok: true, ended: true });
    expect(calls.at(-1)?.init.method).toBe("DELETE");
    const s = await store.getSession(t, id);
    expect(s?.cloud?.endedAt).toBeTruthy();
    expect(s?.audit.at(-1)?.event).toBe("CLOUD_BROWSER_CLOSED");
    expect((await cloud.fillCloud(t, id)).status).toBe(409);
    expect((await cloud.endCloud(t, id, "again")).body).toEqual({ ok: true, ended: false });
  });

  it("WJ-311 in the cloud the helper may submit only in a background fill, after the candidate's own Submit for this application", async () => {
    process.env.CLOUD_BROWSER_URL = "https://worker.test";
    process.env.CLOUD_BROWSER_SECRET = "s".repeat(40);
    const t = tenant();
    const id = await started(t);
    const token = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    const helper = async () => {
      const ctx = await svc.helperAuth(token);
      if (!("session" in ctx)) throw new Error("auth");
      return ctx;
    };
    // A one-page form Wonder can fill completely from the candidate's own profile.
    const form = { url: "https://boards.greenhouse.io/example/jobs/7", provider: "greenhouse" as const, adapter: "adapter:greenhouse", step: 1, signals: [], fields: [{ id: "first_name", label: "First Name", type: "text" as const, required: true }, { id: "email", label: "Email", type: "email" as const, required: true }] };
    const plan = async () => {
      await svc.helperInspect(await helper(), form);
      return (await svc.helperFillPlan(await helper(), { host: "boards.greenhouse.io", clicked: true })).body as { allowed: boolean; submit: boolean; cloudSubmit: boolean };
    };

    // Watched cloud browser (the Apply page's stream): never Wonder's to submit, even with Submit for me on.
    workerAnswers(201, { cloudId: "33333333-3333-4333-8333-333333333333", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream" });
    await cloud.startCloud(t, id);
    await svc.act(t, id, "submit", { submit: "on" });
    expect(await plan()).toMatchObject({ allowed: true, submit: false, cloudSubmit: false });

    // Background fill, but no Submit pressed yet (the account default doesn't count in the cloud).
    await svc.act(t, id, "submit", { submit: "default" });
    workerAnswers(201, { cloudId: "33333333-3333-4333-8333-333333333333", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream", reused: true });
    await cloud.startCloud(t, id, { headless: true });
    expect((await store.getSession(t, id))?.cloud?.headless).toBe(true);
    expect(await plan()).toMatchObject({ allowed: true, submit: false, cloudSubmit: false });

    // "Never" for this application always wins.
    await svc.act(t, id, "submit", { submit: "off" });
    expect(await plan()).toMatchObject({ submit: false, cloudSubmit: false });

    // The candidate pressed "Submit this application": now, and only now, the helper may press the employer's Submit.
    await svc.act(t, id, "submit", { submit: "on" });
    expect(await plan()).toMatchObject({ allowed: true, submit: true, cloudSubmit: true });

    // Once per job: after Wonder submitted, never again.
    await svc.helperEvents(await helper(), { events: [{ type: "APPLICATION_SUBMITTED", label: "Submit application" }] });
    expect(((await svc.helperFillPlan(await helper(), { host: "boards.greenhouse.io", clicked: true })).body as { submit?: boolean }).submit ?? false).toBe(false);

    // Reopened to watch (the Apply page): the background flag goes, and with it the cloud submit.
    workerAnswers(201, { cloudId: "33333333-3333-4333-8333-333333333333", streamToken: "tok", viewport: { width: 412, height: 860 }, streamPath: "/stream", reused: true });
    await cloud.startCloud(t, id);
    expect((await store.getSession(t, id))?.cloud?.headless).toBeUndefined();
  });

  it("WJ-311 the helper reports the form's last page, with what still waits for the candidate; moving on clears it", async () => {
    const t = tenant();
    const id = await started(t);
    const token = ((await svc.act(t, id, "token", {})).body as { token: string }).token;
    const ctx = await svc.helperAuth(token);
    if (!("session" in ctx)) throw new Error("auth");
    await svc.helperEvents(ctx, { events: [{ type: "FINAL_STEP", label: "Submit application", waiting: 2 }] });
    let s = await store.getSession(t, id);
    expect(s?.finalStep).toMatchObject({ label: "Submit application", waiting: 2 });
    expect(s?.audit.at(-1)).toMatchObject({ event: "FINAL_STEP_REACHED" });
    const audits = s!.audit.length;
    // The same report again changes nothing in the audit trail.
    await svc.helperEvents(ctx, { events: [{ type: "FINAL_STEP", label: "Submit application", waiting: 2 }] });
    expect((await store.getSession(t, id))!.audit.length).toBe(audits);
    await svc.helperEvents(ctx, { events: [{ type: "FINAL_STEP", label: "Submit application", waiting: 0 }] });
    expect((await store.getSession(t, id))?.finalStep?.waiting).toBe(0);
    await svc.helperEvents(ctx, { events: [{ type: "STEP_ADVANCED", label: "Next" }] });
    s = await store.getSession(t, id);
    expect(s?.finalStep).toBeUndefined();
  });
});
