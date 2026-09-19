import { afterEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdmin = vi.fn();
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin(), touchTenant: async () => {} }));

import { notifyTenant, pushPublicKey, vapidConfig } from "./subscriptions";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  getSupabaseAdmin.mockReset();
});

describe("vapidConfig", () => {
  it("is null until the operator sets both keys", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(vapidConfig()).toBeNull();
    expect(pushPublicKey()).toBeNull();

    process.env.VAPID_PUBLIC_KEY = "public";
    expect(vapidConfig()).toBeNull(); // half a pair is not a pair
    process.env.VAPID_PRIVATE_KEY = "private";
    expect(vapidConfig()).toMatchObject({ publicKey: "public", privateKey: "private" });
  });

  it("falls back to a contact address, which RFC 8292 requires", () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    delete process.env.VAPID_SUBJECT;
    expect(vapidConfig()!.subject).toMatch(/^mailto:/);
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    expect(vapidConfig()!.subject).toBe("mailto:ops@example.com");
  });
});

describe("notifyTenant", () => {
  it("reports honestly that nothing was sent when push isn't configured", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    getSupabaseAdmin.mockReturnValue({});
    expect(await notifyTenant("t1", { title: "x", body: "y", url: "/app" })).toEqual({ sent: 0, removed: 0, failed: 0, configured: false });
  });

  it("does nothing, rather than throwing, when there is no database", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    getSupabaseAdmin.mockReturnValue(null);
    expect(await notifyTenant("t1", { title: "x", body: "y", url: "/app" })).toMatchObject({ configured: false, sent: 0 });
  });

  it("survives a database that won't answer — a push is a nudge, never the record", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    getSupabaseAdmin.mockReturnValue({
      from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "down" } }) }) }),
    });
    expect(await notifyTenant("t1", { title: "x", body: "y", url: "/app" })).toEqual({ sent: 0, removed: 0, failed: 0, configured: true });
  });
});
