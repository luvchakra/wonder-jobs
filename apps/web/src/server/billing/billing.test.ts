import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../crypto";
import { GENESIS_HASH, ledgerHash, verifyLedgerChain } from "./ledger";
import { MemoryBillingStore, setBillingStoreForTests } from "./store";
import { formEncode, verifyStripeSignature } from "./stripe";
import { verifyRazorpaySignature } from "./razorpay";
import { BillingError, cancelSubscription, clearPriceCacheForTests, entitlement, handleWebhook, providerAvailability, reconcileSubscriptions, startCheckout } from "./service";

const ENV = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_pro",
  RAZORPAY_KEY_ID: "rzp_test_id",
  RAZORPAY_KEY_SECRET: "rzp_secret",
  RAZORPAY_WEBHOOK_SECRET: "rzp_whsec",
  RAZORPAY_PLAN_ID: "plan_pro",
};

let store: MemoryBillingStore;
beforeEach(() => {
  store = new MemoryBillingStore();
  setBillingStoreForTests(store);
  clearPriceCacheForTests();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setBillingStoreForTests(undefined);
});

function stripeHeaders(body: string, secret = ENV.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  return new Headers({ "stripe-signature": `t=${t},v1=${hmacSha256Hex(secret, `${t}.${body}`)}` });
}
function razorpayHeaders(body: string, id = "evt_r1", secret = ENV.RAZORPAY_WEBHOOK_SECRET) {
  return new Headers({ "x-razorpay-signature": hmacSha256Hex(secret, body), "x-razorpay-event-id": id });
}
const now = Math.floor(Date.now() / 1000);

describe("webhook signatures", () => {
  it("Stripe: accepts a valid signature, rejects a wrong secret, a tampered body and a stale timestamp", () => {
    const body = '{"id":"evt"}';
    const t = 1_790_000_000;
    const header = `t=${t},v1=${hmacSha256Hex("whsec", `${t}.${body}`)}`;
    expect(verifyStripeSignature(body, header, "whsec", t)).toBe(true);
    expect(verifyStripeSignature(body, header, "other", t)).toBe(false);
    expect(verifyStripeSignature('{"id":"evil"}', header, "whsec", t)).toBe(false);
    expect(verifyStripeSignature(body, header, "whsec", t + 301)).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec", t)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", "whsec", t)).toBe(false);
  });

  it("Razorpay: accepts the body's HMAC and nothing else", () => {
    const body = '{"event":"subscription.charged"}';
    expect(verifyRazorpaySignature(body, hmacSha256Hex("s", body), "s")).toBe(true);
    expect(verifyRazorpaySignature(body, hmacSha256Hex("s", body + " "), "s")).toBe(false);
    expect(verifyRazorpaySignature(body, "", "s")).toBe(false);
  });
});

describe("billing ledger hash chain", () => {
  it("matches the hash Postgres computes in append_billing_event (migration 0008)", () => {
    // Computed by running the migration on Postgres 16 and appending this exact event.
    const h = ledgerHash(GENESIS_HASH, { provider: "stripe", eventId: "evt_1", providerType: "invoice.paid", kind: "payment_succeeded", tenantId: "t1", subscriptionId: "sub_1", amount: 49900, currency: "INR", occurredAt: "2026-10-01T00:00:00.000Z", payloadSha256: "abc", outcome: "applied" });
    expect(h).toBe("93b85f282af32e5ef30935897e15911041badafc8f00481c1aa4db1f578ce574");
    const h2 = ledgerHash(h, { provider: "razorpay", eventId: "evt_2", providerType: "subscription.charged", kind: "payment_succeeded", tenantId: null, subscriptionId: "sub_2", amount: null, currency: null, occurredAt: "2026-10-02T00:00:00.000Z", payloadSha256: "def", outcome: "applied" });
    expect(h2).toBe("c951b0053b3053a62109daff984186986b117e29c35fd54feb7dd5b800c16f39");
  });

  it("detects an altered row, a removed row and verifies an intact chain", async () => {
    for (let i = 1; i <= 4; i++) await store.append({ provider: "stripe", eventId: `e${i}`, providerType: "invoice.paid", kind: "payment_succeeded", tenantId: "t", subscriptionId: "s", amount: 100 * i, currency: "USD", occurredAt: `2026-10-0${i}T00:00:00.000Z`, payloadSha256: "p", outcome: "applied" });
    const rows = store._rows();
    expect(verifyLedgerChain(rows)).toMatchObject({ ok: true, rows: 4 });
    expect(verifyLedgerChain(rows.map((r) => (r.seq === 2 ? { ...r, amount: 1 } : r)))).toMatchObject({ ok: false, brokenAt: 2 });
    expect(verifyLedgerChain(rows.filter((r) => r.seq !== 3))).toMatchObject({ ok: false, brokenAt: 4 });
  });

  it("records a redelivered event once", async () => {
    const entry = { provider: "stripe" as const, eventId: "dup", providerType: "x", kind: "ignored" as const, occurredAt: "2026-10-01T00:00:00.000Z", payloadSha256: "p", outcome: "ignored" };
    expect(await store.append(entry)).toEqual({ seq: 1, duplicate: false });
    expect(await store.append(entry)).toEqual({ seq: 1, duplicate: true });
  });
});

describe("webhook handling end to end (in-memory store)", () => {
  const subUpdated = (status: string, created = now) =>
    JSON.stringify({ id: `evt_${status}_${created}`, type: "customer.subscription.updated", created, data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { tenant_id: "tenant-a" }, items: { data: [{ current_period_end: created + 2592000, price: { id: "price_pro" } }] } } } });

  it("unlocks Pro only after a signature-verified subscription event", async () => {
    expect((await entitlement("tenant-a")).plan).toBe("free");
    const body = subUpdated("active");
    expect((await handleWebhook("stripe", body, new Headers({ "stripe-signature": "t=1,v1=bad" }))).status).toBe(401);
    expect((await entitlement("tenant-a")).plan).toBe("free");
    const ok = await handleWebhook("stripe", body, stripeHeaders(body));
    expect(ok).toEqual({ status: 200, body: { received: true, duplicate: false, outcome: "applied" } });
    expect((await entitlement("tenant-a")).plan).toBe("pro");
  });

  it("a redelivery is acknowledged as a duplicate and changes nothing", async () => {
    const body = subUpdated("active");
    await handleWebhook("stripe", body, stripeHeaders(body));
    const again = await handleWebhook("stripe", body, stripeHeaders(body));
    expect(again.body).toMatchObject({ received: true, duplicate: true });
    expect(store._rows()).toHaveLength(1);
  });

  it("refuses webhooks when the provider isn't configured, instead of trusting them", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const body = subUpdated("active");
    expect((await handleWebhook("stripe", body, stripeHeaders(body))).status).toBe(503);
  });

  it("ledgers the payment amount from a Razorpay charge and activates the subscription", async () => {
    const body = JSON.stringify({ event: "subscription.charged", created_at: now, payload: { subscription: { entity: { id: "sub_R", plan_id: "plan_pro", status: "active", current_end: now + 2592000, notes: { tenant_id: "tenant-r" } } }, payment: { entity: { amount: 49900, currency: "INR" } } } });
    expect((await handleWebhook("razorpay", body, razorpayHeaders(body))).status).toBe(200);
    expect((await entitlement("tenant-r")).plan).toBe("pro");
    expect(store._rows()[0]).toMatchObject({ amount: 49900, currency: "INR", tenantId: "tenant-r", kind: "payment_succeeded" });
  });

  it("never moves a stored subscription to the tenant named in a later event", async () => {
    const first = subUpdated("active");
    await handleWebhook("stripe", first, stripeHeaders(first));
    const hijack = JSON.stringify({ id: "evt_hijack", type: "customer.subscription.updated", created: now + 5, data: { object: { id: "sub_1", status: "active", metadata: { tenant_id: "attacker" } } } });
    const r = await handleWebhook("stripe", hijack, stripeHeaders(hijack));
    expect(r.body.outcome).toBe("tenant_mismatch");
    expect((await entitlement("attacker")).plan).toBe("free");
    expect(store._rows().at(-1)).toMatchObject({ tenantId: "tenant-a", outcome: "tenant_mismatch" });
  });
});

describe("checkout, availability and cancellation (provider APIs mocked)", () => {
  it("reports needs_setup with variable names only, and never opens checkout without a webhook secret", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "price_pro", unit_amount: 1200, currency: "usd", active: true, recurring: { interval: "month", interval_count: 1 }, product: { name: "Pro" } }))));
    const avail = await providerAvailability();
    expect(avail.find((a) => a.provider === "razorpay")).toEqual({ provider: "razorpay", state: "needs_setup", missing: ["RAZORPAY_WEBHOOK_SECRET"] });
    await expect(startCheckout({ tenantId: "t", provider: "razorpay", origin: "https://x" })).rejects.toBeInstanceOf(BillingError);
  });

  it("never passes the provider's own error text (which can quote the API key) to the candidate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API Key provided: sk_test_x", description: "key rzp_secret bad" } }), { status: 401 })));
    const avail = await providerAvailability();
    expect(JSON.stringify(avail)).not.toMatch(/sk_test_x|rzp_secret/);
    expect(avail).toContainEqual({ provider: "stripe", state: "unavailable", reason: "Stripe rejected this deployment's credentials" });
    await expect(startCheckout({ tenantId: "t", provider: "stripe", origin: "https://x" })).rejects.toThrow("Checkout couldn't start: Stripe rejected this deployment's credentials");
  });

  it("reads the price from Stripe rather than any hardcoded value", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("stripe") ? new Response(JSON.stringify({ id: "price_pro", unit_amount: 1999, currency: "usd", active: true, recurring: { interval: "month", interval_count: 1 }, product: { name: "WonderJobs Pro", description: "From the dashboard" } })) : new Response(JSON.stringify({ id: "plan_pro", period: "monthly", interval: 1, item: { name: "Pro", amount: 49900, currency: "INR" } })))));
    const avail = await providerAvailability();
    expect(avail).toContainEqual({ provider: "stripe", state: "ready", price: { provider: "stripe", ref: "price_pro", name: "WonderJobs Pro", description: "From the dashboard", amount: 1999, currency: "USD", interval: "month", intervalCount: 1 } });
  });

  it("creates a Stripe checkout bound to the tenant, with an idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" })));
    vi.stubGlobal("fetch", fetchMock);
    const { url } = await startCheckout({ tenantId: "tenant-a", email: "a@example.com", provider: "stripe", origin: "https://jobs.example" });
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    const body = decodeURIComponent(String(init.body));
    expect(body).toContain("client_reference_id=tenant-a");
    expect(body).toContain("subscription_data[metadata][tenant_id]=tenant-a");
    expect(body).toContain("line_items[0][price]=price_pro");
    expect(body).toContain("success_url=https://jobs.example/app/profile?billing=success&provider=stripe#plan");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toMatch(/^checkout:tenant-a:pro:\d+$/);
  });

  it("won't start a second subscription for someone who already has Pro", async () => {
    await store.saveSubscription({ tenantId: "t", provider: "stripe", subscriptionId: "sub", status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-10-01T00:00:00.000Z" });
    await expect(startCheckout({ tenantId: "t", provider: "stripe", origin: "https://x" })).rejects.toMatchObject({ status: 409 });
  });

  it("creates a Razorpay subscription, remembers the mapping, and cancels at cycle end on request", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/subscriptions")) return new Response(JSON.stringify({ id: "sub_R1", short_url: "https://rzp.io/i/abc" }));
      return new Response(JSON.stringify({ id: "sub_R1", status: "active", init }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { url } = await startCheckout({ tenantId: "tenant-r", provider: "razorpay", origin: "https://x" });
    expect(url).toBe("https://rzp.io/i/abc");
    const created = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(created).toMatchObject({ plan_id: "plan_pro", notes: { tenant_id: "tenant-r" }, total_count: 120 });
    expect(await store.subscription("razorpay", "sub_R1")).toMatchObject({ tenantId: "tenant-r", status: "incomplete" });
    await store.saveSubscription({ ...(await store.subscription("razorpay", "sub_R1"))!, status: "active", updatedAt: "2026-10-01T00:00:00.000Z" });
    await cancelSubscription("tenant-r");
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(cancelUrl).toBe("https://api.razorpay.com/v1/subscriptions/sub_R1/cancel");
    expect(JSON.parse(String(cancelInit.body))).toEqual({ cancel_at_cycle_end: 1 });
  });
});

describe("daily reconciliation", () => {
  it("corrects drift from the provider's live status and ledgers the correction once per day", async () => {
    await store.saveSubscription({ tenantId: "t", provider: "stripe", subscriptionId: "sub_1", status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-10-01T00:00:00.000Z" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "canceled", cancel_at_period_end: false }))));
    const day = new Date("2026-10-03T02:00:00.000Z");
    expect(await reconcileSubscriptions(10, day)).toEqual({ checked: 1, corrected: 1, errors: 0 });
    expect((await entitlement("t")).plan).toBe("free");
    expect(store._rows()).toHaveLength(1);
    expect(store._rows()[0]).toMatchObject({ kind: "reconciled", providerType: "reconciliation.canceled" });
    expect(await reconcileSubscriptions(10, day)).toEqual({ checked: 0, corrected: 0, errors: 0 });
  });
});

describe("Stripe form encoding", () => {
  it("encodes nested parameters the way Stripe expects", () => {
    expect(formEncode({ a: 1, b: { c: "x y", d: { 0: { e: "f" } } }, skip: undefined })).toBe("a=1&b%5Bc%5D=x%20y&b%5Bd%5D%5B0%5D%5Be%5D=f");
  });
});

describe("review findings (regressions)", () => {
  it("dedupes a replayed Razorpay body even under a fresh, unsigned event-id header", async () => {
    const body = JSON.stringify({ event: "subscription.charged", created_at: now, payload: { subscription: { entity: { id: "sub_R", status: "active", notes: { tenant_id: "t-r" } } }, payment: { entity: { amount: 100, currency: "INR" } } } });
    await handleWebhook("razorpay", body, razorpayHeaders(body, "evt_original"));
    const replay = await handleWebhook("razorpay", body, razorpayHeaders(body, "evt_forged_new_id"));
    expect(replay.body).toMatchObject({ duplicate: true });
    expect(store._rows()).toHaveLength(1);
  });

  it("a late webhook for an erased account is ledgered but doesn't re-create the account", async () => {
    const { recordPrivacyRequest, resetPrivacyMemory } = await import("../privacy/records");
    resetPrivacyMemory();
    await recordPrivacyRequest("gone", "erasure", "completed");
    const body = JSON.stringify({ id: "evt_late", type: "customer.subscription.deleted", created: now, data: { object: { id: "sub_gone", status: "canceled", customer: "cus_gone", metadata: { tenant_id: "gone" } } } });
    const r = await handleWebhook("stripe", body, stripeHeaders(body));
    expect(r.body.outcome).toBe("erased_account");
    expect(await store.subscriptionsForTenant("gone")).toEqual([]);
    expect(store._rows()).toHaveLength(1);
    resetPrivacyMemory();
  });

  it("a Razorpay cancellation shows at once (ledgered as WonderJobs' own event)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "sub_C", status: "active" }))));
    await store.saveSubscription({ tenantId: "t-c", provider: "razorpay", subscriptionId: "sub_C", status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-11-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });
    await cancelSubscription("t-c");
    expect(await store.subscription("razorpay", "sub_C")).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(store._rows().at(-1)).toMatchObject({ providerType: "wonderjobs.cancel_requested" });
    expect((await entitlement("t-c")).reason).toContain("Cancelled — Pro until");
  });

  it("reconciliation checks every open subscription, including one still awaiting its first confirmation", async () => {
    for (let i = 0; i < 450; i++) await store.saveSubscription({ tenantId: `t${i}`, provider: "stripe", subscriptionId: `sub_${i}`, status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-10-01T00:00:00.000Z" });
    await store.saveSubscription({ tenantId: "paid-but-missed", provider: "razorpay", subscriptionId: "sub_missed", status: "incomplete", cancelAtPeriodEnd: false, updatedAt: new Date(0).toISOString() });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("razorpay") ? { status: "active" } : { status: "active", cancel_at_period_end: false, cancel_at: null }))));
    const r = await reconcileSubscriptions(5000, new Date("2026-10-03T02:00:00.000Z"));
    expect(r.checked).toBe(451);
    expect((await entitlement("paid-but-missed")).plan).toBe("pro");
  });
});
