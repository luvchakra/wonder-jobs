import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApplicationProfile } from "@/domain/jobs-apply/profile";
import { EMPTY_DNA } from "@/domain/career/types";
import type { ApplicationPackSnapshot, JobsApplySession } from "@/domain/jobs-apply/types";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-jobsapply-tokens-0123456789";

let svc: typeof import("./service");
let cloud: typeof import("./cloud");
let store: typeof import("./store");
beforeAll(async () => {
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

async function started(t: string, mode: "guided" | "assisted" = "assisted") {
  const c = await svc.create(t, { job: job(), pack: pack(), mode });
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
    expect(sent).toMatchObject({ sessionId: id, tenantId: t, url: "https://boards.greenhouse.io/example/jobs/7" });
    expect(sent.domains).toContain("boards.greenhouse.io");
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
});
