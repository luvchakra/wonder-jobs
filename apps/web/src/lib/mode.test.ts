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

  it("is local when no one is signed in, with or without Supabase Auth", () => {
    stubCookies("");
    expect(getClientMode()).toEqual({ mode: "local" });
    vi.unstubAllEnvs();
    expect(getClientMode()).toEqual({ mode: "local" });
  });

  it("is the signed-in user when the user cookie is set", () => {
    stubCookies("wj_user=user-123");
    expect(getClientMode()).toEqual({ mode: "user", userId: "user-123" });
  });

  // The old demo cookie is no longer read: a leftover one from before demo mode was removed changes nothing.
  it("ignores a leftover demo cookie", () => {
    stubCookies("wj_demo=1");
    expect(getClientMode()).toEqual({ mode: "local" });
    stubCookies("wj_demo=1; wj_user=user-123");
    expect(getClientMode()).toEqual({ mode: "user", userId: "user-123" });
  });
});

describe("storageKeyFor", () => {
  it("namespaces by user id, or not at all, per mode", () => {
    expect(storageKeyFor("wj.career", { mode: "user", userId: "abc" })).toBe("abc:wj.career");
    expect(storageKeyFor("wj.career", { mode: "local" })).toBe("wj.career");
  });
});

describe("syncsToServer", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true for a signed-in user", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(syncsToServer({ mode: "user", userId: "abc" })).toBe(true);
  });

  it("is true in local development without Supabase Auth, false when signed out where sign-in exists", () => {
    expect(syncsToServer({ mode: "local" })).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(syncsToServer({ mode: "local" })).toBe(false);
  });
});
