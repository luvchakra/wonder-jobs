import { afterEach, describe, expect, it, vi } from "vitest";

/* Auth: whoever the test says is signed in; null is signed out. Real auth is configured. */
let email: string | null = null;
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true }));
vi.mock("@/server/auth", () => {
  class AuthRequiredError extends Error {}
  return {
    AuthRequiredError,
    getSession: async () => {
      if (!email) throw new AuthRequiredError("Sign in required");
      return { userId: "u1", tenantId: "u1", email };
    },
  };
});

import { GET } from "./route";

const admin = async () => ((await (await GET()).json()) as { admin: boolean }).admin;

afterEach(() => {
  email = null;
  delete process.env.JOBSLAKE_ADMIN_EMAILS;
  delete process.env.JOBSLAKE_ADMIN_ENABLED;
});

describe("/api/admin/me — only listed admins get a yes", () => {
  it("signed out, a candidate, or an unset list are not admins", async () => {
    expect(await admin()).toBe(false);
    email = "someone@example.com";
    expect(await admin()).toBe(false);
    process.env.JOBSLAKE_ADMIN_EMAILS = "boss@example.com";
    expect(await admin()).toBe(false);
  });

  it("a listed email is an admin, unless the portal is turned off", async () => {
    process.env.JOBSLAKE_ADMIN_EMAILS = "Boss@example.com, other@example.com";
    email = "boss@example.com";
    expect(await admin()).toBe(true);
    process.env.JOBSLAKE_ADMIN_ENABLED = "false";
    expect(await admin()).toBe(false);
  });
});
