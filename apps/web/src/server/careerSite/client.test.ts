import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "wjcs_" + "k".repeat(32) + "abcd";
let key: string | null = KEY;
vi.mock("./key", () => ({ resolveCareersKey: async () => key }));

import * as C from "./client";

const job = { id: "job_abc123", title: "Engineer", location: "Remote", workMode: "remote", currency: "INR", description: "Build", skills: ["TypeScript"], company: "WonderJobs", updatedAt: "2026-10-21T00:00:00Z" };
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
let logs: string[];
beforeEach(() => {
  key = KEY;
  C.clearCareersCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  logs = [];
  for (const m of ["info", "warn", "error", "log"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  delete process.env.WONDERJOBS_CAREERS_URL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the careers API client", () => {
  it("sends the key as a Bearer header to the fixed host, with no caching", async () => {
    fetchMock.mockResolvedValue(reply(200, { site: { name: "WonderJobs careers", retentionMonths: 12 }, jobs: [job] }));
    const r = await C.listCareerJobs();
    expect(r).toEqual({ state: "ok", data: { site: { name: "WonderJobs careers", retentionMonths: 12 }, jobs: [job] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://jobs.wonderapps.biz/api/careers/v1/jobs");
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(init.cache).toBe("no-store");
  });

  it("accepts an override only on an https *.wonderapps.biz host", () => {
    expect(C.careersBase(undefined)).toBe("https://jobs.wonderapps.biz");
    expect(C.careersBase("https://staging.wonderapps.biz/")).toBe("https://staging.wonderapps.biz");
    expect(C.careersBase("http://staging.wonderapps.biz")).toBeNull();
    expect(C.careersBase("https://evil.example.com")).toBeNull();
    expect(C.careersBase("https://wonderapps.biz.evil.com")).toBeNull();
    expect(C.careersBase("https://user:pw@jobs.wonderapps.biz")).toBeNull();
  });

  it("refuses to call anywhere when the override isn't allowed", async () => {
    process.env.WONDERJOBS_CAREERS_URL = "https://evil.example.com";
    expect((await C.listCareerJobs()).state).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs setup without a key, and never calls", async () => {
    key = null;
    expect((await C.listCareerJobs()).state).toBe("needs_setup");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches the job list for up to a minute, never the status", async () => {
    fetchMock.mockImplementation(async () => reply(200, { site: { name: "s", retentionMonths: null }, jobs: [job] }));
    await C.listCareerJobs(1_000);
    await C.listCareerJobs(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await C.listCareerJobs(62_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async () => reply(200, { application: { status: "new" } }));
    await C.careerApplicationStatus("wjst_" + "t".repeat(30));
    await C.careerApplicationStatus("wjst_" + "t".repeat(30));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("times out after 8 seconds", async () => {
    expect(C.TIMEOUT_MS).toBe(8_000);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(reply(200, { jobs: [] }));
    await C.listCareerJobs();
    expect(timeout).toHaveBeenCalledWith(8_000);
    fetchMock.mockReset();
    const err = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    fetchMock.mockRejectedValue(err);
    C.clearCareersCache();
    expect((await C.listCareerJobs()).state).toBe("unavailable");
    expect(logs.join("\n")).toContain("timeout");
  });

  it("retries a GET once on a network error or a 5xx", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(reply(200, { jobs: [job] }));
    expect((await C.listCareerJobs()).state).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    C.clearCareersCache();
    fetchMock.mockResolvedValue(reply(502, {}));
    expect((await C.listCareerJobs()).state).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a POST", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const body = { name: "Asha", email: "a@x.io", resumeUrl: "https://x.io/cv", consent: true as const };
    expect((await C.submitCareerApplication("job_abc123", body)).state).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(reply(503, {}));
    expect((await C.submitCareerApplication("job_abc123", body)).state).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 401, 404, 409 and 429", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: "Unknown career site key" }));
    expect((await C.listCareerJobs()).state).toBe("unauthorized");
    fetchMock.mockResolvedValueOnce(reply(404, { error: "This position is no longer open." }));
    expect((await C.getCareerJob("job_abc123")).state).toBe("not_found");
    fetchMock.mockResolvedValueOnce(reply(409, { error: "You already applied for this job." }));
    const body = { name: "Asha", email: "a@x.io", resumeUrl: "https://x.io/cv", consent: true as const };
    expect(await C.submitCareerApplication("job_abc123", body)).toEqual({ state: "rejected", status: 409, message: "You already applied for this job." });
    fetchMock.mockResolvedValueOnce(reply(400, { error: "Enter a valid email address." }));
    expect(await C.submitCareerApplication("job_abc123", body)).toEqual({ state: "rejected", status: 400, message: "Enter a valid email address." });
    fetchMock.mockResolvedValueOnce(reply(429, { error: "slow down" }, { "retry-after": "42" }));
    C.clearCareersCache();
    expect(await C.listCareerJobs()).toEqual({ state: "busy", retryAfterSec: 42 });
  });

  it("never puts the key in a result, an error or a log", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: `bad key ${KEY}` }));
    const r = await C.listCareerJobs();
    fetchMock.mockRejectedValueOnce(new Error(`connect failed for ${KEY}`)).mockRejectedValueOnce(new Error(`again ${KEY}`));
    C.clearCareersCache();
    const r2 = await C.listCareerJobs();
    expect(JSON.stringify([r, r2])).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain("kkkk");
  });

  it("sends the status token in the body, never in the address, and logs no body", async () => {
    const token = "wjst_" + "s".repeat(40);
    fetchMock.mockResolvedValue(reply(200, { application: { status: "reviewing", statusLabel: "In review", jobTitle: "Engineer", company: "WonderJobs", appliedAt: "x", updatedAt: "x", canWithdraw: true } }));
    await C.careerApplicationStatus(token, "withdraw");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://jobs.wonderapps.biz/api/careers/v1/applications/status");
    expect(url).not.toContain(token);
    expect(JSON.parse(init.body)).toEqual({ token, action: "withdraw" });
    expect(logs.join("\n")).not.toContain(token);
  });

  it("logs only the job id, the status and the time", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, id: "app_1" }));
    await C.submitCareerApplication("job_abc123", { name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://x.io/cv", consent: true });
    const line = logs.join("\n");
    expect(line).toMatch(/POST job job_abc123 200 \d+ms/);
    expect(line).not.toContain("asha@example.com");
    expect(line).not.toContain("Asha");
  });

  it("tests the connection: connected with the count, wrong key, unavailable", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { site: { name: "WonderJobs careers" }, jobs: [job, job] }));
    expect(await C.testCareersConnection()).toEqual({ state: "connected", jobs: 2, site: "WonderJobs careers" });
    fetchMock.mockResolvedValueOnce(reply(401, {}));
    expect(await C.testCareersConnection()).toEqual({ state: "wrong_key" });
    fetchMock.mockResolvedValue(reply(500, {}));
    expect(await C.testCareersConnection()).toEqual({ state: "unavailable" });
  });

  it("refuses odd job ids and tokens without calling", async () => {
    expect((await C.getCareerJob("../admin")).state).toBe("not_found");
    expect((await C.careerApplicationStatus("not-a-token")).state).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
