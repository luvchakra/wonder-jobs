import { describe, expect, it, vi } from "vitest";

// N21 (docs: WonderStar-notifications.xlsx): turning notifications on sends one push straight away.
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/server/auth", () => ({ requireSession: async () => ({ tenantId: "t-push" }) }));
const sent: { tenant: string; title: string; tag?: string }[] = [];
vi.mock("@/server/push/subscriptions", () => ({
  pushPublicKey: () => "BPublicKey",
  countSubscriptions: async () => 1,
  removeSubscription: async () => undefined,
  saveSubscription: vi.fn(async () => undefined),
  notifyTenant: vi.fn(async (tenant: string, p: { title: string; tag?: string }) => (sent.push({ tenant, ...p }), { sent: 1 })),
}));

import { POST } from "./route";

describe("turning notifications on", () => {
  it("N21 saves the browser and sends one push so the candidate sees it worked", async () => {
    const res = await POST(new Request("http://localhost/api/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: "https://push.example.com/abc", keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } }) }));
    expect(await res.json()).toEqual({ ok: true, delivered: true });
    expect(sent).toEqual([expect.objectContaining({ tenant: "t-push", title: "Notifications are on", tag: "wj-test" })]);
  });

  it("N21 refuses a subscription that isn't https, and sends nothing", async () => {
    sent.length = 0;
    const res = await POST(new Request("http://localhost/api/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: "http://push.example.com/abc", keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } }) }));
    expect(res.status).toBe(400);
    expect(sent).toEqual([]);
  });
});
