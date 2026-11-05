import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { __resetPlatformKeys, setPlatformKey } from "./platformKeys";
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
    expect(TESTABLE.size).toBe(10);
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
});
