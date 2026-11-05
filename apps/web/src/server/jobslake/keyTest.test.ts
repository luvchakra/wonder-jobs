import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { __resetPlatformKeys, PLATFORM_KEYS, setPlatformKey } from "./platformKeys";
import { TESTABLE, testPlatformKey } from "./keyTest";

const reply = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;

describe("Test on Admin → Keys", () => {
  beforeEach(() => {
    __setJobsLakeStore(new __MemoryStore());
    __resetPlatformKeys();
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetPlatformKeys();
  });

  it("every key has a test", () => {
    // Every key on the Keys page, however many there are.
    expect(TESTABLE.size).toBe(PLATFORM_KEYS.length);
  });

  it("asks for the other half of a pair before testing", async () => {
    await setPlatformKey("USAJOBS_API_KEY", "abcd1234");
    const f = reply(200);
    expect(await testPlatformKey("USAJOBS_API_KEY", f)).toEqual({ ok: false, message: "Set USAJOBS_EMAIL first." });
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the saved key to the provider and reports what it answered, never the key", async () => {
    await setPlatformKey("TICKETMASTER_API_KEY", "tm-secret-1xrv");
    const ok = reply(200);
    const r = await testPlatformKey("TICKETMASTER_API_KEY", ok);
    expect(r.ok).toBe(true);
    expect(String((ok as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain("apikey=tm-secret-1xrv");
    const bad = await testPlatformKey("TICKETMASTER_API_KEY", reply(401));
    expect(bad).toMatchObject({ ok: false });
    expect(bad.message).toContain("Rejected (401)");
    expect(JSON.stringify(bad)).not.toContain("tm-secret");
  });

  it("says Unavailable when the provider can't be reached", async () => {
    await setPlatformKey("JOOBLE_API_KEY", "jb-1234");
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect((await testPlatformKey("JOOBLE_API_KEY", down)).message).toMatch(/^Unavailable/);
    expect((await testPlatformKey("NOPE")).message).toBe("No test for this key.");
  });

  it("sends Jooble a real word: it answers 400 to an empty search even with a good key", async () => {
    await setPlatformKey("JOOBLE_API_KEY", "jb-1234");
    const f = reply(200);
    expect((await testPlatformKey("JOOBLE_API_KEY", f)).ok).toBe(true);
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(JSON.parse(String(init.body)).keywords).not.toBe("");
  });

  it("tests Kaggle's new token as a Bearer token, on its own", async () => {
    await setPlatformKey("KAGGLE_API_TOKEN", "KGAT_abc123");
    const f = reply(200);
    expect((await testPlatformKey("KAGGLE_API_TOKEN", f)).ok).toBe(true);
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer KGAT_abc123");
  });
});
