import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearApiPriceCache, ApiBillingError, apiAccountStatus, apiBillingPortal, confirmApiCheckout, reportApiUsage, startApiCheckout } from "./apiBilling";
import { __setApiStore, MemoryApiStore } from "./apiStore";
import { chargeUnits } from "./developer";

/** A fake Stripe: answers by method + path, records every call (decoded form body included). */
type Call = { method: string; path: string; body: URLSearchParams; idempotencyKey: string | null };
let calls: Call[];
let routes: Record<string, (c: Call) => { status?: number; json: unknown }>;
function stripe() {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const headers = new Headers(init?.headers);
    const c: Call = { method: init?.method ?? "GET", path: u.pathname.replace(/^\/v1/, ""), body: new URLSearchParams(String(init?.body ?? "")), idempotencyKey: headers.get("idempotency-key") };
    calls.push(c);
    const route = routes[`${c.method} ${c.path}`];
    if (!route) return new Response(JSON.stringify({ error: { message: "no route" } }), { status: 404 });
    const r = route(c);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}

let store: MemoryApiStore;
const OWNER = "tenant-a";
const NOW = new Date("2026-10-09T02:00:00Z");

beforeEach(() => {
  store = new MemoryApiStore();
  __setApiStore(store);
  __clearApiPriceCache();
  calls = [];
  routes = {
    "GET /prices/price_api": () => ({ json: { id: "price_api", active: true, currency: "usd", billing_scheme: "per_unit", unit_amount_decimal: "1", recurring: { usage_type: "metered", interval: "month" }, product: { name: "JobsLake API" } } }),
    "POST /checkout/sessions": () => ({ json: { id: "cs_test_1", url: "https://checkout.stripe.com/c/cs_test_1" } }),
    "GET /subscriptions/sub_api": () => ({ json: { id: "sub_api", status: "active" } }),
    "POST /billing/meter_events": () => ({ json: { object: "billing.meter_event" } }),
  };
  vi.stubGlobal("fetch", stripe());
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_API_PRICE_ID", "price_api");
  vi.stubEnv("STRIPE_API_METER_EVENT", "jobslake_api_search");
  vi.stubEnv("JOBSLAKE_API_FREE_SEARCHES", "100");
});
afterEach(() => {
  __setApiStore(undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const session = (over: Record<string, unknown> = {}) => ({ id: "cs_test_1", mode: "subscription", status: "complete", payment_status: "no_payment_required", client_reference_id: OWNER, customer: "cus_1", subscription: "sub_api", metadata: { tenant_id: OWNER, purpose: "jobslake_api" }, ...over });

describe("pay-as-you-go checkout", () => {
  it("opens a metered subscription checkout marked purpose=jobslake_api, with an idempotency key", async () => {
    const { url } = await startApiCheckout({ ownerId: OWNER, email: "a@example.com", origin: "https://wonderjobs.test" });
    expect(url).toBe("https://checkout.stripe.com/c/cs_test_1");
    const c = calls.find((x) => x.path === "/checkout/sessions")!;
    expect(c.body.get("mode")).toBe("subscription");
    expect(c.body.get("line_items[0][price]")).toBe("price_api");
    expect(c.body.has("line_items[0][quantity]")).toBe(false);
    expect(c.body.get("client_reference_id")).toBe(OWNER);
    expect(c.body.get("metadata[purpose]")).toBe("jobslake_api");
    expect(c.body.get("subscription_data[metadata][purpose]")).toBe("jobslake_api");
    expect(c.body.get("subscription_data[metadata][tenant_id]")).toBe(OWNER);
    expect(c.body.get("success_url")).toBe("https://wonderjobs.test/api/jobs-lake/api-billing/confirm?session_id={CHECKOUT_SESSION_ID}");
    expect(c.idempotencyKey).toMatch(/^jlapi-checkout:tenant-a:/);
  });

  it("isn't offered without STRIPE_API_PRICE_ID, and the UI says so", async () => {
    vi.stubEnv("STRIPE_API_PRICE_ID", "");
    await expect(startApiCheckout({ ownerId: OWNER, origin: "https://x" })).rejects.toBeInstanceOf(ApiBillingError);
    const s = await apiAccountStatus(OWNER, NOW);
    expect(s.billing).toEqual({ state: "unavailable", reason: "Pay-as-you-go isn't available yet" });
    expect(calls).toHaveLength(0);
  });

  it("shows the price Stripe has, and refuses a price that isn't metered rather than inventing one", async () => {
    expect((await apiAccountStatus(OWNER, NOW)).billing).toEqual({ state: "available", price: { unitAmountDecimal: "1", currency: "USD", perUnits: 1, productName: "JobsLake API" } });
    __clearApiPriceCache();
    routes["GET /prices/price_api"] = () => ({ json: { id: "price_api", active: true, currency: "usd", unit_amount: 900, recurring: { usage_type: "licensed", interval: "month" } } });
    const s = await apiAccountStatus(OWNER, NOW);
    expect(s.billing.state).toBe("unavailable");
  });

  it("confirm rejects a session whose client_reference_id is another tenant, and stores nothing", async () => {
    routes["GET /checkout/sessions/cs_test_1"] = () => ({ json: session({ client_reference_id: "tenant-b" }) });
    await expect(confirmApiCheckout(OWNER, "cs_test_1")).rejects.toMatchObject({ status: 403 });
    expect(await store.getBilling(OWNER)).toBeUndefined();
  });

  it("confirm rejects a checkout that isn't for the API or isn't complete", async () => {
    routes["GET /checkout/sessions/cs_test_1"] = () => ({ json: session({ metadata: { tenant_id: OWNER } }) });
    await expect(confirmApiCheckout(OWNER, "cs_test_1")).rejects.toMatchObject({ status: 400 });
    routes["GET /checkout/sessions/cs_test_1"] = () => ({ json: session({ status: "open" }) });
    await expect(confirmApiCheckout(OWNER, "cs_test_1")).rejects.toMatchObject({ status: 409 });
    await expect(confirmApiCheckout(OWNER, "../../v1/customers")).rejects.toMatchObject({ status: 400 });
    expect(await store.getBilling(OWNER)).toBeUndefined();
  });

  it("confirm stores the customer and subscription with the status Stripe reports", async () => {
    routes["GET /checkout/sessions/cs_test_1"] = () => ({ json: session() });
    const rec = await confirmApiCheckout(OWNER, "cs_test_1");
    expect(rec).toMatchObject({ ownerId: OWNER, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_api", status: "active" });
    expect((await apiAccountStatus(OWNER, NOW)).billing.state).toBe("active");
  });

  it("the account page notices a subscription cancelled in Stripe, and the portal opens for the account's own customer only", async () => {
    await store.putBilling({ ownerId: OWNER, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_api", status: "active", updatedAt: "2026-10-01T00:00:00Z" });
    routes["POST /billing_portal/sessions"] = () => ({ json: { url: "https://billing.stripe.com/p/1" } });
    expect((await apiBillingPortal(OWNER, "https://x")).url).toBe("https://billing.stripe.com/p/1");
    expect(calls.at(-1)!.body.get("customer")).toBe("cus_1");
    await expect(apiBillingPortal("tenant-b", "https://x")).rejects.toMatchObject({ status: 404 });
    routes["GET /subscriptions/sub_api"] = () => ({ json: { id: "sub_api", status: "canceled" } });
    expect((await apiAccountStatus(OWNER, NOW)).billing.state).toBe("available");
    expect((await store.getBilling(OWNER))?.status).toBe("inactive");
  });

  it("an unreadable subscription at confirm time is stored as not active (fail closed)", async () => {
    routes["GET /checkout/sessions/cs_test_1"] = () => ({ json: session() });
    routes["GET /subscriptions/sub_api"] = () => ({ status: 500, json: {} });
    expect((await confirmApiCheckout(OWNER, "cs_test_1")).status).toBe("inactive");
  });
});

describe("daily usage report", () => {
  const activate = () => store.putBilling({ ownerId: OWNER, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_api", status: "active", enabledAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });

  it("posts each complete day's overage once, with identifier = idempotency key, and marks it reported", async () => {
    await activate();
    await store.meter(OWNER, "2026-10-06", 90);
    await store.meter(OWNER, "2026-10-07", 30); // 120 → 20 over
    await store.meter(OWNER, "2026-10-08", 7); // 127 → 7 over
    await store.meter(OWNER, "2026-10-09", 50); // today — not yet
    const r = await reportApiUsage(NOW);
    expect(r).toMatchObject({ configured: true, accounts: 1, reported: 2, units: 27, failed: 0, deactivated: 0 });
    const posts = calls.filter((c) => c.path === "/billing/meter_events");
    expect(posts.map((p) => [p.body.get("identifier"), p.body.get("payload[value]"), p.body.get("payload[stripe_customer_id]"), p.body.get("event_name")])).toEqual([
      ["jl:tenant-a:2026-10-07", "20", "cus_1", "jobslake_api_search"],
      ["jl:tenant-a:2026-10-08", "7", "cus_1", "jobslake_api_search"],
    ]);
    expect(posts.map((p) => p.idempotencyKey)).toEqual(["jl:tenant-a:2026-10-07", "jl:tenant-a:2026-10-08"]);
    expect(posts[0].body.get("timestamp")).toBe(String(Date.parse("2026-10-07T23:59:59Z") / 1000));
    expect((await store.usage(OWNER, "2026-10-01")).map((d) => [d.day, d.reportedUnits])).toEqual([
      ["2026-10-06", 0],
      ["2026-10-07", 20],
      ["2026-10-08", 7],
      ["2026-10-09", 0],
    ]);
    // A rerun the same day reports nothing again.
    calls = [];
    expect((await reportApiUsage(NOW)).reported).toBe(0);
    expect(calls.filter((c) => c.path === "/billing/meter_events")).toHaveLength(0);
  });

  it("a day Stripe refused stays unreported and is retried next run", async () => {
    await activate();
    await store.meter(OWNER, "2026-10-08", 130);
    routes["POST /billing/meter_events"] = () => ({ status: 500, json: {} });
    expect(await reportApiUsage(NOW)).toMatchObject({ reported: 0, failed: 1 });
    expect((await store.usage(OWNER, "2026-10-08"))[0].reportedUnits).toBe(0);
    routes["POST /billing/meter_events"] = () => ({ json: {} });
    expect(await reportApiUsage(NOW)).toMatchObject({ reported: 1, units: 30 });
  });

  it("a cancelled subscription is turned off, nothing is reported, and the free limit is a hard stop again", async () => {
    await activate();
    await store.meter(OWNER, "2026-10-08", 130);
    routes["GET /subscriptions/sub_api"] = () => ({ json: { id: "sub_api", status: "canceled" } });
    const r = await reportApiUsage(NOW);
    expect(r).toMatchObject({ deactivated: 1, reported: 0 });
    expect((await store.getBilling(OWNER))?.status).toBe("inactive");
    expect(calls.filter((c) => c.path === "/billing/meter_events")).toHaveLength(0);
    const charge = await chargeUnits(OWNER, 1, NOW);
    expect(charge).toMatchObject({ ok: false, status: 402, code: "QUOTA_EXCEEDED" });
  });

  it("an unreadable subscription status counts as not active (fail closed), and is re-read next run", async () => {
    await activate();
    routes["GET /subscriptions/sub_api"] = () => ({ status: 503, json: {} });
    await reportApiUsage(NOW);
    expect((await store.getBilling(OWNER))?.status).toBe("inactive");
    routes["GET /subscriptions/sub_api"] = () => ({ json: { id: "sub_api", status: "active" } });
    await reportApiUsage(NOW);
    expect((await store.getBilling(OWNER))?.status).toBe("active");
  });

  it("does nothing when pay-as-you-go isn't configured", async () => {
    vi.stubEnv("STRIPE_API_PRICE_ID", "");
    await activate();
    expect(await reportApiUsage(NOW)).toMatchObject({ configured: false, accounts: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("metering", () => {
  it("counts allowed units, refunds refused ones, and fails closed when billing can't be read", async () => {
    vi.stubEnv("JOBSLAKE_API_FREE_SEARCHES", "1");
    expect((await chargeUnits(OWNER, 1, NOW)).ok).toBe(true);
    expect((await chargeUnits(OWNER, 1, NOW)).ok).toBe(false);
    expect((await store.usage(OWNER, "2026-10-01"))[0].units).toBe(1);
    store.getBilling = async () => {
      throw new Error("db down");
    };
    expect(await chargeUnits(OWNER, 1, NOW)).toMatchObject({ ok: false, status: 402 });
    store.meter = async () => {
      throw new Error("db down");
    };
    expect(await chargeUnits(OWNER, 1, NOW)).toMatchObject({ ok: false, status: 503 });
  });
});
