import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.fn();
const status = vi.fn();
vi.mock("@/server/careerSite/client", () => ({ submitCareerApplication: (...a: unknown[]) => submit(...a), careerApplicationStatus: (...a: unknown[]) => status(...a) }));

import { POST as apply } from "./jobs/[id]/applications/route";
import { POST as statusPost } from "./status/route";

const form = { name: "  Asha Rao ", email: "Asha@Example.com", resumeUrl: "https://drive.example.com/cv", consent: true };
let ip = 0;
const nextIp = () => `198.51.100.${++ip}`;
const post = (body: unknown, addr = nextIp(), id = "job_abc123") =>
  apply(new Request(`http://localhost/api/careers/site/jobs/${id}/applications`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": addr }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  submit.mockReset();
  status.mockReset();
});

describe("applying on WonderStar' own careers page", () => {
  it("checks and trims the form before forwarding it", async () => {
    submit.mockResolvedValue({ state: "ok", data: { ok: true, id: "app_1" } });
    const res = await post({ ...form, coverNote: "  Hello  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(submit).toHaveBeenCalledWith("job_abc123", { name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://drive.example.com/cv", consent: true, coverNote: "Hello" });
  });

  it("refuses a missing name, a bad email, http links and no consent, without calling WonderStar", async () => {
    for (const bad of [{ ...form, name: "" }, { ...form, email: "nope" }, { ...form, resumeUrl: "http://x.io/cv" }, { ...form, resumeUrl: "" }, { ...form, linkedinUrl: "javascript:alert(1)" }, { ...form, consent: false }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it("pretends success to a bot that fills the hidden field, and sends nothing", async () => {
    const res = await post({ ...form, website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("limits each address to about ten applications an hour", async () => {
    submit.mockResolvedValue({ state: "ok", data: { ok: true, id: "a" } });
    const addr = "203.0.113.99";
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(form, addr)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    expect(submit).toHaveBeenCalledTimes(10);
    expect((await post(form)).status).toBe(200);
  });

  it("says sent only on WonderStar' 200; passes 400 / 409 messages on; a plain retry otherwise", async () => {
    submit.mockResolvedValueOnce({ state: "rejected", status: 409, message: "You already applied for this job." });
    let res = await post(form);
    expect([res.status, (await res.json()).error]).toEqual([409, "You already applied for this job."]);
    submit.mockResolvedValueOnce({ state: "not_found" });
    res = await post(form);
    expect([res.status, (await res.json()).error]).toEqual([404, "This position is no longer open."]);
    for (const r of [{ state: "unavailable" }, { state: "unauthorized" }, { state: "needs_setup" }]) {
      submit.mockResolvedValueOnce(r);
      res = await post(form);
      expect(res.status).toBe(503);
      expect((await res.json()).ok).toBeUndefined();
    }
    submit.mockResolvedValueOnce({ state: "busy", retryAfterSec: 20 });
    res = await post(form);
    expect([res.status, res.headers.get("retry-after")]).toEqual([429, "20"]);
  });
});

describe("withdrawing from the status page", () => {
  const send = (body: unknown) => statusPost(new Request("http://localhost/api/careers/site/status", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": nextIp() }, body: JSON.stringify(body) }));

  it("passes the token on in the body to the status call", async () => {
    const token = "wjst_" + "a".repeat(40);
    status.mockResolvedValue({ state: "ok", data: { status: "withdrawn", canWithdraw: false } });
    const res = await send({ token, action: "withdraw" });
    expect(res.status).toBe(200);
    expect(status).toHaveBeenCalledWith(token, "withdraw");
  });

  it("answers an unknown token with the email-link message", async () => {
    status.mockResolvedValue({ state: "not_found" });
    const res = await send({ token: "wjst_nope", action: "withdraw" });
    expect([res.status, (await res.json()).error]).toEqual([404, "We couldn't find that application. Use the link in your email."]);
  });
});
