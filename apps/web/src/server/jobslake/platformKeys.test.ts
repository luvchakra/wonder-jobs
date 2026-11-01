import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { __resetPlatformKeys, loadPlatformKeys, PLATFORM_KEYS, platformKey, platformKeyStatus, setPlatformKey } from "./platformKeys";

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
});
