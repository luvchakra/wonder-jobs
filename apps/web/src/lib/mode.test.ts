import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientMode, storageKeyFor, syncsToServer } from "./mode";

function stubCookies(cookie: string) {
  vi.stubGlobal("document", { cookie });
}

describe("getClientMode", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is local when Supabase Auth isn't configured and neither cookie is set", () => {
    vi.unstubAllEnvs();
    stubCookies("");
    expect(getClientMode()).toEqual({ mode: "local" });
  });

  it("is demo when auth is configured but no one is signed in", () => {
    stubCookies("");
    expect(getClientMode()).toEqual({ mode: "demo" });
  });

  it("is demo when only the demo cookie is set", () => {
    stubCookies("wj_demo=1");
    expect(getClientMode()).toEqual({ mode: "demo" });
  });

  it("is the signed-in user when only the user cookie is set", () => {
    stubCookies("wj_user=user-123");
    expect(getClientMode()).toEqual({ mode: "user", userId: "user-123" });
  });

  // Regression: a real session must always win over a leftover demo cookie. Trying the demo before
  // signing up leaves `wj_demo=1` for up to 30 days; without this priority, a real sign-in would keep
  // silently showing seeded demo data instead of the account's own — see rememberUser in auth/browser.ts,
  // which also clears the demo cookie outright once a real session exists, but getClientMode must not
  // depend on that cleanup having already run (e.g. a stale cookie from before that fix shipped).
  it("prefers a real signed-in session over a leftover demo cookie", () => {
    stubCookies("wj_demo=1; wj_user=user-123");
    expect(getClientMode()).toEqual({ mode: "user", userId: "user-123" });
  });
});

describe("storageKeyFor", () => {
  it("namespaces by user id, by demo, or not at all, per mode", () => {
    expect(storageKeyFor("wj.career", { mode: "user", userId: "abc" })).toBe("abc:wj.career");
    expect(storageKeyFor("wj.career", { mode: "demo" })).toBe("demo:wj.career");
    expect(storageKeyFor("wj.career", { mode: "local" })).toBe("wj.career");
  });
});

describe("syncsToServer", () => {
  it("is false only in demo mode", () => {
    expect(syncsToServer({ mode: "demo" })).toBe(false);
    expect(syncsToServer({ mode: "user", userId: "abc" })).toBe(true);
    expect(syncsToServer({ mode: "local" })).toBe(true);
  });
});
