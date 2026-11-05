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
    // Every key on the Keys page has a Test, however many there are, except those named here (other sessions' keys, whose
    // Tests they add and then take their name out); a new key without a Test fails this, a new key with one needs no edit.
    const untested = PLATFORM_KEYS.map((k) => k.name).filter((n) => !TESTABLE.has(n));
    expect(untested.sort()).toEqual(["NAV_PAM_STILLING_FEED_TOKEN"]);
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

  it("tests the Find an apprenticeship key with one small Display Advert API v2 request, the key in its header", async () => {
    await setPlatformKey("FIND_APPRENTICESHIP_API_KEY", "fa-secret-77");
    const f = reply(200);
    expect((await testPlatformKey("FIND_APPRENTICESHIP_API_KEY", f)).ok).toBe(true);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.apprenticeships.education.gov.uk/vacancies/vacancy?PageSize=1&PageNumber=1");
    expect(init.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "fa-secret-77", "X-Version": "2" });
    expect(JSON.stringify(await testPlatformKey("FIND_APPRENTICESHIP_API_KEY", reply(401)))).not.toContain("fa-secret");
  });

  it("sends Jooble a real word: it answers 400 to an empty search even with a good key", async () => {
    await setPlatformKey("JOOBLE_API_KEY", "jb-1234");
    const f = reply(200);
    expect((await testPlatformKey("JOOBLE_API_KEY", f)).ok).toBe(true);
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(JSON.parse(String(init.body)).keywords).not.toBe("");
  });

  it("tests Flipkart's and eBay's pairs together, with the credentials in headers, never the address", async () => {
    await setPlatformKey("FLIPKART_AFFILIATE_ID", "fk-track-1");
    const none = reply(200);
    expect(await testPlatformKey("FLIPKART_AFFILIATE_ID", none)).toEqual({ ok: false, message: "Set FLIPKART_AFFILIATE_TOKEN first." });
    expect(none).not.toHaveBeenCalled();
    await setPlatformKey("FLIPKART_AFFILIATE_TOKEN", "fk-token-secret");
    const f = reply(200);
    expect((await testPlatformKey("FLIPKART_AFFILIATE_TOKEN", f)).ok).toBe(true);
    const [, fkInit] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(fkInit.headers).toMatchObject({ "Fk-Affiliate-Id": "fk-track-1", "Fk-Affiliate-Token": "fk-token-secret" });
    await setPlatformKey("EBAY_CLIENT_ID", "ebay-app-1");
    await setPlatformKey("EBAY_CLIENT_SECRET", "ebay-cert-secret");
    const e = reply(401);
    const bad = await testPlatformKey("EBAY_CLIENT_ID", e);
    expect(bad.message).toContain("Rejected (401)");
    const [url, init] = (e as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(url).not.toMatch(/ebay-app|ebay-cert/);
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("ebay-app-1:ebay-cert-secret").toString("base64")}`);
    expect(JSON.stringify(bad)).not.toContain("ebay-cert");
  });

  it("tests Simpler.Grants.gov with X-API-Key and clist.by with ApiKey username:key", async () => {
    await setPlatformKey("SIMPLER_GRANTS_API_KEY", "sg-key-1234");
    const sg = reply(200);
    expect((await testPlatformKey("SIMPLER_GRANTS_API_KEY", sg)).ok).toBe(true);
    const [sgUrl, sgInit] = (sg as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(sgUrl).toBe("https://api.simpler.grants.gov/v1/opportunities/search");
    expect((sgInit.headers as Record<string, string>)["X-API-Key"]).toBe("sg-key-1234");
    await setPlatformKey("CLIST_API_KEY", "cl-key-1234");
    expect((await testPlatformKey("CLIST_API_KEY", reply(200))).message).toBe("Set CLIST_USERNAME first.");
    await setPlatformKey("CLIST_USERNAME", "someone");
    const cl = reply(200);
    expect((await testPlatformKey("CLIST_USERNAME", cl)).ok).toBe(true);
    const clInit = (cl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((clInit.headers as Record<string, string>).authorization).toBe("ApiKey someone:cl-key-1234");
  });

  it("tests Kaggle's new token as a Bearer token, on its own", async () => {
    await setPlatformKey("KAGGLE_API_TOKEN", "KGAT_abc123");
    const f = reply(200);
    expect((await testPlatformKey("KAGGLE_API_TOKEN", f)).ok).toBe(true);
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer KGAT_abc123");
  });
});

describe("TheirStack's keys are tested one by one (2026-11-05)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetPlatformKeys();
  });
  it("says how many of the keys work", async () => {
    vi.stubEnv("THEIRSTACK_API_KEYS", "good-key-1111,bad-key-2222");
    const fetcher = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => new Response("{}", { status: String((init?.headers as Record<string, string>).authorization).includes("good") ? 200 : 401 }));
    const r = await testPlatformKey("THEIRSTACK_API_KEYS", fetcher as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, message: "1 of 2 keys work, 1 rejected. Credits aren't checked here; a key out of credits is skipped during searches." });
  });
});
