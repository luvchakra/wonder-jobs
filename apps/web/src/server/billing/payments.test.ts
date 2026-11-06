import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../crypto";
import { MemoryBillingStore, setBillingStoreForTests } from "./store";
import { missingBillingEnv, razorpayConfig, razorpayMode } from "./config";
import { __resetBillingKeys, billingKeyStatus, setBillingKeys } from "./credentials";
import { verifyRazorpayCheckout } from "./razorpay";
import { BillingError, clearPriceCacheForTests, confirmRazorpayCheckout, entitlement, paymentsLive, providerAvailability, startCheckout } from "./service";
import { paymentsSetup, savePaymentKeys } from "./paymentsAdmin";
import { AdminBillingError } from "./admin";

const SUPA = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
const KEYS = { RAZORPAY_KEY_ID: "rzp_test_abcdef123", RAZORPAY_KEY_SECRET: "secret_abcdef", RAZORPAY_WEBHOOK_SECRET: "whsec_abcdef" };

let store: MemoryBillingStore;
beforeEach(() => {
  store = new MemoryBillingStore();
  setBillingStoreForTests(store);
  clearPriceCacheForTests();
  __resetBillingKeys();
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
    await expect(savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: "wrong_secret" }, "admin@x", "https://x")).rejects.toThrow(/refused/);
    expect(missingBillingEnv("razorpay")).toContain("RAZORPAY_KEY_ID");
    await expect(savePaymentKeys({ keyId: "not-a-key" }, "admin@x", "https://x")).rejects.toBeInstanceOf(AdminBillingError);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ count: 0, items: [] })));
    const setup = await savePaymentKeys({ keyId: KEYS.RAZORPAY_KEY_ID, keySecret: KEYS.RAZORPAY_KEY_SECRET }, "admin@x", "https://x");
    expect(setup).toMatchObject({ mode: "test", connection: { state: "connected" }, live: false, webhook: { url: "https://x/api/billing/webhooks/razorpay", secretSet: false } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/plans?count=1");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${KEYS.RAZORPAY_KEY_ID}:${KEYS.RAZORPAY_KEY_SECRET}`).toString("base64")}`);
  });

  it("refuses to save over a value the deployment sets", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "from_env_secret");
    await expect(savePaymentKeys({ webhookSecret: "another_secret" }, "admin@x", "https://x")).rejects.toThrow(/set in the deployment/);
  });
});

describe("going live", () => {
  it("connected but without a Pro price: not live, testing plans stay on, and nobody can pay yet", async () => {
    await setBillingKeys(KEYS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ count: 0 }))));
    expect(await paymentsLive()).toBe(false);
    expect((await providerAvailability()).find((p) => p.provider === "razorpay")).toEqual({ provider: "razorpay", state: "needs_setup", missing: ["PRO_PRICE"] });
    expect((await paymentsSetup("https://x")).live).toBe(false);
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
    expect(started).toEqual({ provider: "razorpay", url: "https://rzp.io/i/w", subscriptionId: "sub_W1", keyId: KEYS.RAZORPAY_KEY_ID, planLabel: "Pro" });
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
