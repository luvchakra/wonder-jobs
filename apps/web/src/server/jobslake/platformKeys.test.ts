import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { __resetPlatformKeys, kaggleAuthorization, loadPlatformKeys, PLATFORM_KEYS, platformKey, platformKeyStatus, removePlatformKeyAt, setPlatformKey } from "./platformKeys";

describe("platform API keys — set on the platform, not the hosting dashboard", () => {
  beforeEach(() => {
    __setJobsLakeStore(new __MemoryStore());
    __resetPlatformKeys();
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
    vi.stubEnv("ADZUNA_APP_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetPlatformKeys();
  });

  it("stores a key encrypted, gives it to the sources, and shows it only masked", async () => {
    expect(platformKey("ADZUNA_APP_KEY")).toBeUndefined();
    expect((await setPlatformKey("ADZUNA_APP_KEY", " abcdef123456 ")).ok).toBe(true);
    expect(platformKey("ADZUNA_APP_KEY")).toBe("abcdef123456");
    const row = (await platformKeyStatus()).find((k) => k.name === "ADZUNA_APP_KEY")!;
    expect(row).toMatchObject({ set: true, from: "platform" });
    expect(JSON.stringify(await platformKeyStatus())).not.toContain("abcdef123456");
  });

  it("removes a key, and refuses unknown names and junk values", async () => {
    await setPlatformKey("ADZUNA_APP_KEY", "abcdef123456");
    await setPlatformKey("ADZUNA_APP_KEY", null);
    expect(platformKey("ADZUNA_APP_KEY")).toBeUndefined();
    expect((await setPlatformKey("SUPABASE_SERVICE_ROLE_KEY", "abcdef123456")).ok).toBe(false);
    expect((await setPlatformKey("ADZUNA_APP_KEY", "ab")).ok).toBe(false);
  });

  it("shares one read between callers that arrive together (a page resolving every source at once)", async () => {
    const store = new __MemoryStore();
    __setJobsLakeStore(store);
    const spy = vi.spyOn(store, "getCredential");
    await Promise.all(Array.from({ length: 50 }, () => loadPlatformKeys()));
    const keys = spy.mock.calls.length;
    expect(keys).toBeGreaterThan(0);
    expect(keys).toBe(PLATFORM_KEYS.length); // one read of each key, not fifty
  });

  it("lets a deployment variable of the same name win", async () => {
    await setPlatformKey("ADZUNA_APP_KEY", "fromplatform");
    vi.stubEnv("ADZUNA_APP_KEY", "fromenv");
    await loadPlatformKeys(Date.now(), true);
    expect(platformKey("ADZUNA_APP_KEY")).toBe("fromenv");
    expect((await platformKeyStatus()).find((k) => k.name === "ADZUNA_APP_KEY")).toMatchObject({ from: "environment", masked: "Set in the deployment" });
  });

  it("gives Kaggle the new token as Bearer, else the old pair (deployment variables only) as Basic, else nothing", async () => {
    expect(kaggleAuthorization()).toBeUndefined();
    vi.stubEnv("KAGGLE_USERNAME", "someone");
    vi.stubEnv("KAGGLE_KEY", "abcd1234");
    expect(kaggleAuthorization()).toBe(`Basic ${Buffer.from("someone:abcd1234").toString("base64")}`);
    await setPlatformKey("KAGGLE_API_TOKEN", "KGAT_abc123");
    expect(kaggleAuthorization()).toBe("Bearer KGAT_abc123");
  });
});

describe("several TheirStack keys on Admin → Keys (2026-11-05)", () => {
  beforeEach(() => {
    __setJobsLakeStore(new __MemoryStore());
    __resetPlatformKeys();
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
    vi.stubEnv("THEIRSTACK_API_KEYS", "envkey-111111");
    vi.stubEnv("THEIRSTACK_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetPlatformKeys();
  });

  it("adds keys to the list, lists them masked, removes one, and the source uses the admin's first, then the deployment's", async () => {
    const { theirStackKeys } = await import("@/server/jobs/theirstack");
    expect((await setPlatformKey("THEIRSTACK_API_KEYS", "adminkey-aaaa1111\nadminkey-bbbb2222")).ok).toBe(true);
    expect((await setPlatformKey("THEIRSTACK_API_KEYS", "adminkey-bbbb2222, adminkey-cccc3333")).message).toMatch(/^1 key added \(3 saved\)/);
    const row = (await platformKeyStatus()).find((k) => k.name === "THEIRSTACK_API_KEYS")!;
    expect(row).toMatchObject({ set: true, from: "platform", envCount: 1, masked: "3 keys + 1 in the deployment" });
    expect(row.keys).toEqual(["••••••••1111", "••••••••2222", "••••••••3333"]);
    expect(JSON.stringify(row)).not.toContain("adminkey");
    expect(theirStackKeys()).toEqual(["adminkey-aaaa1111", "adminkey-bbbb2222", "adminkey-cccc3333", "envkey-111111"]);
    expect((await removePlatformKeyAt("THEIRSTACK_API_KEYS", 1)).ok).toBe(true);
    expect(theirStackKeys()).toEqual(["adminkey-aaaa1111", "adminkey-cccc3333", "envkey-111111"]);
    expect((await removePlatformKeyAt("THEIRSTACK_API_KEYS", 9)).ok).toBe(false);
  });
});
