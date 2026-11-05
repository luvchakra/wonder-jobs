import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { __resetPlatformKeys, setPlatformKey } from "./platformKeys";
import { BUILTIN_SOURCES, runConnector } from "./registry";

describe("a source's Test reads the keys set on Admin → Keys first (2026-11-05: USAJOBS said it needed credentials)", () => {
  beforeEach(() => {
    __setJobsLakeStore(new __MemoryStore());
    __resetPlatformKeys();
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
    vi.stubEnv("USAJOBS_API_KEY", "");
    vi.stubEnv("USAJOBS_EMAIL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetPlatformKeys();
  });

  it("runs USAJOBS with platform keys on a server that hadn't read them yet", async () => {
    await setPlatformKey("USAJOBS_API_KEY", "test-key-123456");
    await setPlatformKey("USAJOBS_EMAIL", "wj-e2e-keys@example.com");
    __resetPlatformKeys(); // a fresh server: nothing read into memory yet
    const fetch = vi.fn(async () => new Response(JSON.stringify({ SearchResult: { SearchResultItems: [], SearchResultCountAll: 0 } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const src = BUILTIN_SOURCES.find((s) => s.id === "usajobs")!;
    await expect(runConnector(src, { query: "", locations: [] }, "normal")).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalled();
  });
});
