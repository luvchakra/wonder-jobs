import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../crypto";
import { MemoryBillingStore, setBillingStoreForTests } from "./store";
import { missingBillingEnv, razorpayConfig, razorpayMode } from "./config";
import { __resetBillingKeys, billingKeyStatus, setBillingKeys } from "./credentials";
import { clearRazorpaySubscriptionsCache, verifyRazorpayCheckout, verifyRazorpayOrder } from "./razorpay";
import { handleWebhook, reconcileSubscriptions } from "./service";
import { entitlementFor } from "@/domain/billing/subscription";
import { addMonth, prepaidStart } from "@/domain/billing/prepaid";
import { BillingError, clearPriceCacheForTests, confirmRazorpayCheckout, entitlement, paymentsLive, providerAvailability, startCheckout } from "./service";
import { clean, paymentsSetup, savePaymentKeys } from "./paymentsAdmin";
import { AdminBillingError } from "./admin";

const SUPA = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
const KEYS = { RAZORPAY_KEY_ID: "rzp_test_abcdef123", RAZORPAY_KEY_SECRET: "secret_abcdef", RAZORPAY_WEBHOOK_SECRET: "whsec_abcdef" };

let store: MemoryBillingStore;
beforeEach(() => {
  store = new MemoryBillingStore();
  setBillingStoreForTests(store);
  clearPriceCacheForTests();
  __resetBillingKeys();
  clearRazorpaySubscriptionsCache();
  for (const [k, v] of Object.entries(SUPA)) vi.stubEnv(k, v);
});
afterEach(async () => {
  await setBillingKeys({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null, RAZORPAY_WEBHOOK_SECRET: null });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setBillingStoreForTests(undefined);
});

describe("Razorpay keys entered in the admin", () => {
  it("connect Razorpay without any deployment variable, and never show a secret", async () => {
    expect(missingBillingEnv("razorpay")).toEqual(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]);
    await setBillingKeys(KEYS);
    expect(missingBillingEnv("razorpay")).toEqual([]);
    expect(razorpayConfig()).toMatchObject({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: KEYS.RAZORPAY_KEY_SECRET, planId: undefined });
    const status = await billingKeyStatus();
    expect(JSON.stringify(status)).not.toContain(KEYS.RAZORPAY_KEY_SECRET);
    expect(JSON.stringify(status)).not.toContain(KEYS.RAZORPAY_WEBHOOK_SECRET);
    expect(status.find((k) => k.name === "RAZORPAY_KEY_ID")).toMatchObject({ shown: KEYS.RAZORPAY_KEY_ID, from: "admin" });
  });

  it("a deployment variable still wins, and a test's own env never sees the admin's keys", async () => {
    await setBillingKeys(KEYS);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_fromenv1");
    expect(razorpayConfig()?.keyId).toBe("rzp_live_fromenv1");
    expect(razorpayConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(razorpayMode("rzp_live_x")).toBe("live");
    expect(razorpayMode("rzp_test_x")).toBe("test");
  });

  it("checks a new key pair with Razorpay before saving it; a refused pair replaces nothing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    // Razorpay doesn't know the Key ID either (its public preferences endpoint answers 401 too).
    await expect(savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: "wrong_secret" }, "admin@x", "https://x")).rejects.toThrow(/doesn't know the Key ID/);
    expect(missingBillingEnv("razorpay")).toContain("RAZORPAY_KEY_ID");
    await expect(savePaymentKeys({ keyId: "not-a-key" }, "admin@x", "https://x")).rejects.toBeInstanceOf(AdminBillingError);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ count: 0, items: [] })));
    const setup = await savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: KEYS.RAZORPAY_KEY_SECRET }, "admin@x", "https://x");
    expect(setup).toMatchObject({ mode: "test", connection: { state: "connected" }, live: false, webhook: { url: "https://x/api/billing/webhooks/razorpay", secretSet: false } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/payments?count=1");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${KEYS.RAZORPAY_KEY_ID}:${KEYS.RAZORPAY_KEY_SECRET}`).toString("base64")}`);
  });

  it("says the secret is the wrong half when Razorpay knows the Key ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/preferences?") ? new Response("{}") : new Response(JSON.stringify({ error: {} }), { status: 401 }))));
    await expect(savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: "wrong_secret" }, "admin@x", "https://x")).rejects.toThrow(/Key ID is right, but Razorpay refused the secret/);
  });

  it("saves test keys without checking only when asked, and never live ones", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(savePaymentKeys({ keyId: "rzp_live_abcdef123", keySecret: "secret_abcdef", unchecked: true }, "admin@x", "https://x")).rejects.toThrow(/Only test keys/);
    const setup = await savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: "secret_abcdef", unchecked: true }, "admin@x", "https://x");
    expect(setup.keys.find((k) => k.name === "RAZORPAY_KEY_ID")).toMatchObject({ set: true, from: "admin" });
    // Saved, but Razorpay still refuses them: shown as such, and payments stay off.
    expect(setup).toMatchObject({ mode: "test", connection: { state: "refused" }, live: false });
  });

  it("drops characters a phone's copy adds and nobody sees, before checking the pair", async () => {
    expect(clean("\u200bsecret_abc\u00a0\n")).toBe("secret_abc");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    await savePaymentKeys({ keyId: ` ${KEYS.RAZORPAY_KEY_ID}\u200b`, keySecret: `\ufeff${KEYS.RAZORPAY_KEY_SECRET}\u200b ` }, "admin@x", "https://x");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${KEYS.RAZORPAY_KEY_ID}:${KEYS.RAZORPAY_KEY_SECRET}`).toString("base64")}`);
  });

  it("refuses to save over a value the deployment sets", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "from_env_secret");
    await expect(savePaymentKeys({ webhookSecret: "another_secret" }, "admin@x", "https://x")).rejects.toThrow(/set in the deployment/);
  });
});

describe("going live", () => {
  it("connected without a Razorpay plan: plans are sold a month at a time at their own price, and payments are live", async () => {
    await setBillingKeys(KEYS);
    // The owner's account (2026-11-06): Payments answers, Plans (the Subscriptions product) doesn't.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/plans") ? new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) : new Response(JSON.stringify({ count: 0 })))));
    expect(await paymentsLive()).toBe(true);
    expect((await providerAvailability()).find((p) => p.provider === "razorpay")).toMatchObject({ state: "ready", price: { ref: "order:pro", amount: 49_900, currency: "INR", interval: "month" } });
    await setBillingKeys({ RAZORPAY_WEBHOOK_SECRET: KEYS.RAZORPAY_WEBHOOK_SECRET });
    expect(await paymentsSetup("https://x")).toMatchObject({ connection: { state: "connected" }, subscriptions: false, live: true });
  });

  it("with a Pro price, payments are live", async () => {
    await setBillingKeys(KEYS);
    vi.stubEnv("RAZORPAY_PLAN_ID", "plan_pro");
    expect(await paymentsLive()).toBe(true);
  });
});

describe("Razorpay's checkout window", () => {
  const sign = (paymentId: string, subscriptionId: string, secret = KEYS.RAZORPAY_KEY_SECRET) => hmacSha256Hex(secret, `${paymentId}|${subscriptionId}`);

  it("verifies the signature Razorpay hands back", () => {
    const sig = sign("pay_1", "sub_1");
    expect(verifyRazorpayCheckout({ paymentId: "pay_1", subscriptionId: "sub_1", signature: sig }, KEYS.RAZORPAY_KEY_SECRET)).toBe(true);
    expect(verifyRazorpayCheckout({ paymentId: "pay_2", subscriptionId: "sub_1", signature: sig }, KEYS.RAZORPAY_KEY_SECRET)).toBe(false);
    expect(verifyRazorpayCheckout({ paymentId: "pay_1", subscriptionId: "sub_1", signature: sign("pay_1", "sub_1", "other") }, KEYS.RAZORPAY_KEY_SECRET)).toBe(false);
  });

  it("starts a subscription for the window, then unlocks the plan from Razorpay's own status, once", async () => {
    await setBillingKeys(KEYS);
    vi.stubEnv("RAZORPAY_PLAN_ID", "plan_pro");
    let status = "authenticated";
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/subscriptions")) return new Response(JSON.stringify({ id: "sub_W1", short_url: "https://rzp.io/i/w" }));
      return new Response(JSON.stringify({ id: "sub_W1", status }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const started = await startCheckout({ tenantId: "tenant-w", provider: "razorpay", origin: "https://x" });
    expect(started).toEqual({ provider: "razorpay", mode: "subscription", url: "https://rzp.io/i/w", subscriptionId: "sub_W1", keyId: KEYS.RAZORPAY_KEY_ID, planLabel: "Pro" });
    expect(JSON.stringify(started)).not.toContain(KEYS.RAZORPAY_KEY_SECRET);

    const paid = { subscriptionId: "sub_W1", paymentId: "pay_W1", signature: sign("pay_W1", "sub_W1") };
    // A forged signature changes nothing; another account can't confirm this subscription.
    await expect(confirmRazorpayCheckout("tenant-w", { ...paid, signature: sign("pay_W1", "sub_W1", "forged") })).rejects.toBeInstanceOf(BillingError);
    await expect(confirmRazorpayCheckout("tenant-other", paid)).rejects.toMatchObject({ status: 404 });

    // Mandate set, first charge not yet confirmed by Razorpay: still Free.
    expect(await confirmRazorpayCheckout("tenant-w", paid)).toEqual({ status: "incomplete" });
    expect((await entitlement("tenant-w")).plan).toBe("free");
    status = "active";
    expect(await confirmRazorpayCheckout("tenant-w", paid)).toEqual({ status: "active" });
    expect((await entitlement("tenant-w")).plan).toBe("pro");
    const ledger = await store.ledgerForTenant("tenant-w");
    expect(ledger.filter((r) => r.providerType === "checkout.active")).toHaveLength(1);
    await confirmRazorpayCheckout("tenant-w", paid);
    expect((await store.ledgerForTenant("tenant-w")).filter((r) => r.providerType === "checkout.active")).toHaveLength(1);
  });
});

describe("Standard Checkout: a paid month through an order", () => {
  const signOrder = (orderId: string, paymentId: string, secret = KEYS.RAZORPAY_KEY_SECRET) => hmacSha256Hex(secret, `${orderId}|${paymentId}`);
  type Order = { id: string; status: string; amount: number; amount_paid: number; currency: string; notes: Record<string, string>; created_at: number };

  function razorpay(orders: Map<string, Order>) {
    let n = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/orders") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const o: Order = { id: `order_${++n}`, status: "created", amount: body.amount, amount_paid: 0, currency: body.currency, notes: body.notes, created_at: Math.floor(Date.now() / 1000) };
        orders.set(o.id, o);
        return new Response(JSON.stringify(o));
      }
      const m = u.match(/\/orders\/(order_\d+)$/);
      if (m) return new Response(JSON.stringify(orders.get(m[1])));
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("verifies the order signature Razorpay hands back", () => {
    const sig = signOrder("order_1", "pay_1");
    expect(verifyRazorpayOrder({ orderId: "order_1", paymentId: "pay_1", signature: sig }, KEYS.RAZORPAY_KEY_SECRET)).toBe(true);
    expect(verifyRazorpayOrder({ orderId: "order_1", paymentId: "pay_2", signature: sig }, KEYS.RAZORPAY_KEY_SECRET)).toBe(false);
    expect(verifyRazorpayOrder({ orderId: "order_1", paymentId: "pay_1", signature: "" }, KEYS.RAZORPAY_KEY_SECRET)).toBe(false);
  });

  it("creates the order at the plan's own price on the server, and unlocks the plan only once Razorpay says it's paid", async () => {
    await setBillingKeys(KEYS);
    const orders = new Map<string, Order>();
    const fetchMock = razorpay(orders);
    const started = await startCheckout({ tenantId: "tenant-o", provider: "razorpay", origin: "https://x" });
    expect(started).toMatchObject({ provider: "razorpay", mode: "order", orderId: "order_1", amount: 49_900, currency: "INR", keyId: KEYS.RAZORPAY_KEY_ID, planLabel: "Pro" });
    expect(JSON.stringify(started)).not.toContain(KEYS.RAZORPAY_KEY_SECRET);
    const created = JSON.parse(String((fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/orders"))![1] as RequestInit).body));
    expect(created).toMatchObject({ amount: 49_900, currency: "INR", notes: { tenant_id: "tenant-o", plan: "pro" } });
    expect(await store.subscription("razorpay", "order_1")).toMatchObject({ status: "incomplete", planRef: "order:pro" });

    const paid = { orderId: "order_1", paymentId: "pay_1", signature: signOrder("order_1", "pay_1") };
    // A forged signature, or someone else's order: nothing changes.
    await expect(confirmRazorpayCheckout("tenant-o", { ...paid, signature: signOrder("order_1", "pay_1", "forged") })).rejects.toMatchObject({ status: 400 });
    await expect(confirmRazorpayCheckout("tenant-x", paid)).rejects.toMatchObject({ status: 404 });
    // Signed, but Razorpay doesn't show it paid yet: still Free.
    expect(await confirmRazorpayCheckout("tenant-o", paid)).toEqual({ status: "incomplete" });
    expect((await entitlement("tenant-o")).plan).toBe("free");

    orders.set("order_1", { ...orders.get("order_1")!, status: "paid", amount_paid: 49_900 });
    expect(await confirmRazorpayCheckout("tenant-o", paid)).toEqual({ status: "active" });
    const ent = await entitlement("tenant-o");
    expect(ent).toMatchObject({ plan: "pro", reason: expect.stringMatching(/^Pro paid until /) });
    expect(ent.until).toBe(addMonth(created.notes.period_start));

    // The webhook for the same order is the same ledger entry: the payment is recorded once.
    const body = JSON.stringify({ event: "order.paid", created_at: Math.floor(Date.now() / 1000), payload: { order: { entity: { ...orders.get("order_1") } }, payment: { entity: { amount: 49_900, currency: "INR" } } } });
    const res = await handleWebhook("razorpay", body, new Headers({ "x-razorpay-signature": hmacSha256Hex(KEYS.RAZORPAY_WEBHOOK_SECRET, body) }));
    expect(res.body).toMatchObject({ received: true, duplicate: true });
    expect((await store.ledgerForTenant("tenant-o")).filter((r) => r.kind === "payment_succeeded")).toHaveLength(1);
  });

  it("the webhook alone settles an order the browser never confirmed", async () => {
    await setBillingKeys(KEYS);
    razorpay(new Map());
    await startCheckout({ tenantId: "tenant-wh", provider: "razorpay", origin: "https://x", plan: "max" });
    const start = "2026-11-06T05:00:00.000Z";
    const body = JSON.stringify({ event: "order.paid", created_at: 1793940000, payload: { order: { entity: { id: "order_1", amount: 129_900, amount_paid: 129_900, currency: "INR", notes: { tenant_id: "tenant-wh", plan: "max", period_start: start } } }, payment: { entity: { amount: 129_900, currency: "INR" } } } });
    await handleWebhook("razorpay", body, new Headers({ "x-razorpay-signature": hmacSha256Hex(KEYS.RAZORPAY_WEBHOOK_SECRET, body) }));
    expect(await store.subscription("razorpay", "order_1")).toMatchObject({ status: "active", planRef: "order:max", currentPeriodEnd: addMonth(start), cancelAtPeriodEnd: true });
  });

  it("a paid month ends on its date, and paying again for the same plan starts when the current month ends", () => {
    const sub = { tenantId: "t", provider: "razorpay" as const, subscriptionId: "order_1", planRef: "order:pro", status: "active" as const, currentPeriodEnd: "2026-12-06T00:00:00.000Z", cancelAtPeriodEnd: true, updatedAt: "2026-11-06T00:00:00.000Z" };
    expect(entitlementFor(sub, () => "pro", new Date("2026-12-01T00:00:00Z")).plan).toBe("pro");
    expect(entitlementFor(sub, () => "pro", new Date("2026-12-07T00:00:00Z"))).toMatchObject({ plan: "free", reason: expect.stringMatching(/ended/) });
    expect(prepaidStart("pro", [sub], new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-06T00:00:00.000Z");
    expect(prepaidStart("max", [sub], new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01T00:00:00.000Z");
    expect(addMonth("2026-01-31T10:00:00.000Z")).toBe("2026-02-28T10:00:00.000Z");
  });

  it("the daily check settles a paid order nobody confirmed, and closes one left unpaid for a week", async () => {
    await setBillingKeys(KEYS);
    const orders = new Map<string, Order>();
    razorpay(orders);
    await startCheckout({ tenantId: "tenant-r1", provider: "razorpay", origin: "https://x" });
    await startCheckout({ tenantId: "tenant-r2", provider: "razorpay", origin: "https://x" });
    orders.set("order_1", { ...orders.get("order_1")!, status: "paid", amount_paid: 49_900 });
    orders.set("order_2", { ...orders.get("order_2")!, created_at: Math.floor(Date.now() / 1000) - 8 * 86_400 });
    const report = await reconcileSubscriptions();
    expect(report.corrected).toBe(2);
    expect((await entitlement("tenant-r1")).plan).toBe("pro");
    expect(await store.subscription("razorpay", "order_2")).toMatchObject({ status: "canceled" });
  });
});
