import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* Real auth configured; nobody signed in unless the request carries a session the mock accepts. */
vi.mock("@/lib/auth/config", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/config")>()), authConfigured: () => true }));
vi.mock("@/server/session", () => ({
  readStoredSession: (get: (n: string) => string | undefined) => (get("wj-auth") ? { access_token: "ok", refresh_token: "r", expires_at: Date.now() / 1000 + 3600 } : null),
  isExpired: () => false,
  refreshStoredSession: async () => null,
  verifyAccessToken: async (t: string) => (t === "ok" ? { userId: "u1", email: "a@example.com" } : null),
}));

import { config, proxy } from "./proxy";

const visit = (path: string, cookie?: string) => proxy(new NextRequest(`https://jobs.example${path}`, { headers: cookie ? { cookie } : {} }));

describe("proxy — the help center needs a signed-in account (WJ-309)", () => {
  it("runs on /help and anything under it", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/help", "/help/:path*"]));
  });

  it("signed out: /help redirects to sign-in and comes back to the page asked for", async () => {
    for (const path of ["/help", "/help/anything?x=1"]) {
      const res = await visit(path);
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/sign-in");
      expect(to.searchParams.get("next")).toBe(path);
    }
  });

  it("signed in: /help goes through", async () => {
    const res = await visit("/help", "wj-auth=session");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("the sign-in and password-reset pages stay open to signed-out visitors", async () => {
    for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) expect((await visit(path)).status, path).toBe(200);
  });
});
