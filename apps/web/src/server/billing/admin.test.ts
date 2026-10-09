import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Auth: a signed-in session the test controls. */
const session = vi.fn();
vi.mock("@/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  class AuthRequiredError extends Error {}
  const getSession = () => session();
  const requireSession = async () => {
    try {
      return await getSession();
    } catch (e) {
      if (e instanceof AuthRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
      throw e;
    }
  };
  return { AuthRequiredError, getSession, requireSession };
});
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true }));
/* One admin makes more changes here than the per-admin limit allows in a burst; the limit isn't what's under test. */
vi.mock("@/server/rateLimit", async (orig) => ({ ...(await orig<typeof import("@/server/rateLimit")>()), rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));

import { AuthRequiredError } from "@/server/auth";
import { stateStore } from "@/server/state";
import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "@/server/jobslake/store";
import { __resetApiPlanCache, currentApiPlan } from "@/server/jobslake/apiPlanSettings";
import { apiSourceIds } from "@/server/jobslake/developer";
import { getPlansConfig } from "./plansConfig";
import { clearLiveBillingCaches, planDiscounts, writeAdminState } from "./live";
import { clearPriceCacheForTests, startCheckout } from "./service";
import { MemoryBillingStore, setBillingStoreForTests } from "./store";
import { planForRef } from "@/domain/billing/plans";
import * as plansRoute from "@/app/api/billing/admin/plans/route";
import * as pricesRoute from "@/app/api/billing/admin/prices/route";
import * as discountsRoute from "@/app/api/billing/admin/discounts/route";
import * as promosRoute from "@/app/api/billing/admin/discounts/promos/route";
import * as automaticRoute from "@/app/api/billing/admin/discounts/automatic/route";
import * as apiPlanRoute from "@/app/api/billing/admin/api-plan/route";
import * as historyRoute from "@/app/api/billing/admin/history/route";

const ADMIN = "admin@example.com";
const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_ID: "price_pro", STRIPE_PRICE_ID_MAX: "price_max" };
const RAZORPAY_ENV = { RAZORPAY_KEY_ID: "rzp_test_id", RAZORPAY_KEY_SECRET: "rzp_secret", RAZORPAY_WEBHOOK_SECRET: "rzp_whsec", RAZORPAY_PLAN_ID: "plan_pro" };

const asAdmin = () => session.mockResolvedValue({ userId: "u-admin", tenantId: "t-admin", email: ADMIN });
const asCandidate = () => session.mockResolvedValue({ userId: "u-c", tenantId: "t-c", email: "candidate@example.com" });
const signedOut = () => session.mockRejectedValue(new AuthRequiredError());
const req = (method: string, body?: unknown) => new Request("https://wonderjobs.test/api/billing/admin/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const audit = () => jobsLakeStore().listAudit(100, "billing");

type Call = { url: string; method: string; body: string; headers: Record<string, string> };
let calls: Call[] = [];
/** A fake Stripe/Razorpay: first matching route answers. */
function providers(routes: { match: (c: Call) => boolean; json: unknown; status?: number }[]) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const c: Call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? decodeURIComponent(String(init.body)) : "", headers: (init?.headers ?? {}) as Record<string, string> };
      calls.push(c);
      const r = routes.find((x) => x.match(c));
      if (!r) return new Response(JSON.stringify({ error: { message: "no route sk_test_x" } }), { status: 404 });
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
    }),
  );
}
const is = (method: string, path: string) => (c: Call) => c.method === method && c.url.split("?")[0].endsWith(path);
const PRICE_PRO = { id: "price_pro", unit_amount: 49_900, currency: "inr", active: true, recurring: { interval: "month", interval_count: 1 }, product: { id: "prod_pro", name: "WonderJobs Pro" } };
const PRICE_MAX = { id: "price_max", unit_amount: 129_900, currency: "inr", active: true, recurring: { interval: "month", interval_count: 1 }, product: { id: "prod_max", name: "WonderJobs Max" } };
const posts = (path: string) => calls.filter((c) => c.method === "POST" && c.url.split("?")[0].endsWith(path));

beforeEach(async () => {
  session.mockReset();
  __setJobsLakeStore(new __MemoryStore());
  setBillingStoreForTests(new MemoryBillingStore());
  for (const d of ["wj.plans", "wj.billingadmin", "wj.apiplan"] as const) await stateStore.remove("__platform__", d);
  clearLiveBillingCaches();
  clearPriceCacheForTests();
  __resetApiPlanCache();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("JOBSLAKE_ADMIN_EMAILS", ADMIN);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setBillingStoreForTests(undefined);
});
const stripeOn = () => Object.entries(STRIPE_ENV).forEach(([k, v]) => vi.stubEnv(k, v));
const razorpayOn = () => Object.entries(RAZORPAY_ENV).forEach(([k, v]) => vi.stubEnv(k, v));

/* ------------------------------------------------------------------ access */

const ROUTES: [string, (r: Request) => Promise<Response>, string][] = [
  ["plans GET", plansRoute.GET, "GET"],
  ["plans PUT", plansRoute.PUT, "PUT"],
  ["prices GET", pricesRoute.GET, "GET"],
  ["prices POST", pricesRoute.POST, "POST"],
  ["prices PUT", pricesRoute.PUT, "PUT"],
  ["discounts GET", discountsRoute.GET, "GET"],
  ["promos POST", promosRoute.POST, "POST"],
  ["promos PATCH", promosRoute.PATCH, "PATCH"],
  ["automatic POST", automaticRoute.POST, "POST"],
  ["automatic DELETE", automaticRoute.DELETE, "DELETE"],
  ["api-plan GET", apiPlanRoute.GET, "GET"],
  ["api-plan PUT", apiPlanRoute.PUT, "PUT"],
  ["history GET", historyRoute.GET, "GET"],
];

describe("billing admin access", () => {
  it.each(ROUTES)("%s: 401 signed out, 403 for a candidate, 404 with the admin portal off — and touches no provider", async (_n, handler, method) => {
    stripeOn();
    providers([]);
    const body = method === "GET" ? undefined : { plan: "pro", amountMinor: 100, currency: "INR", requestId: "req-abcdefgh" };
    signedOut();
    expect((await handler(req(method, body))).status).toBe(401);
    asCandidate();
    expect((await handler(req(method, body))).status).toBe(403);
    vi.stubEnv("JOBSLAKE_ADMIN_ENABLED", "0");
    asAdmin();
    expect((await handler(req(method, body))).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(await audit()).toHaveLength(0);
  });
});

/* ---------------------------------------------------------- plans & features */

describe("plans & features", () => {
  it("saves feature limits only (never the price), audited with who and a diff", async () => {
    asAdmin();
    const res = await plansRoute.PUT(req("PUT", { plans: { pro: { roles: 4, priceMinor: 1, label: "Pro" } } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changes).toEqual([{ field: "pro.roles", from: 3, to: 4 }]);
    const cfg = await getPlansConfig();
    expect(cfg.plans.pro.roles).toBe(4);
    expect(cfg.plans.pro.priceMinor).toBe(49_900);
    const [entry] = await audit();
    expect(entry).toMatchObject({ actor: ADMIN, action: "billing.plans.saved", detail: { changes: [{ field: "pro.roles", from: 3, to: 4 }] } });
  });

  it("refuses an invalid value with a reason", async () => {
    asAdmin();
    const res = await plansRoute.PUT(req("PUT", { plans: { pro: { roles: 0 } } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/plans\.pro\.roles/);
  });
});

/* ------------------------------------------------------------------ prices */

describe("prices", () => {
  it("shows what Stripe charges and 'Needs setup' for an unconnected provider", async () => {
    stripeOn();
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: is("GET", "/prices/price_max"), json: { ...PRICE_MAX, unit_amount: 99_900 } },
    ]);
    asAdmin();
    const body = await (await pricesRoute.GET(req("GET"))).json();
    const pro = body.plans.find((p: { plan: string }) => p.plan === "pro");
    const max = body.plans.find((p: { plan: string }) => p.plan === "max");
    expect(pro.stripe).toMatchObject({ state: "ready", amount: 49_900, currency: "INR", productId: "prod_pro" });
    expect(pro.razorpay).toEqual({ state: "needs_setup" });
    expect(pro.inSync).toBe(true);
    expect(max.inSync).toBe(false);
  });

  it("change price creates a new Stripe price on the same product and a Razorpay plan, with idempotency, then repoints the plan", async () => {
    stripeOn();
    razorpayOn();
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: (c) => is("POST", "/prices")(c) && c.url.includes("stripe"), json: { id: "price_new" } },
      { match: (c) => is("POST", "/plans")(c) && c.url.includes("razorpay"), json: { id: "plan_new" } },
    ]);
    asAdmin();
    const input = { plan: "pro", amountMinor: 59_900, currency: "inr", requestId: "req-12345678" };
    const res = await pricesRoute.POST(req("POST", input));
    expect(res.status).toBe(201);
    const [stripePost] = posts("/v1/prices");
    expect(stripePost.body).toContain("product=prod_pro");
    expect(stripePost.body).toContain("unit_amount=59900");
    expect(stripePost.body).toContain("currency=inr");
    expect(stripePost.body).toContain("recurring[interval]=month");
    expect(stripePost.headers["idempotency-key"]).toBe("price:pro:59900:INR:req-12345678");
    const [rzpPost] = posts("/v1/plans");
    expect(JSON.parse(rzpPost.body)).toMatchObject({ period: "monthly", interval: 1, item: { amount: 59_900, currency: "INR" }, notes: { idempotency_key: "price:pro:59900:INR:req-12345678" } });

    const cfg = await getPlansConfig();
    expect(cfg.plans.pro).toMatchObject({ priceMinor: 59_900, currency: "INR" });
    expect(cfg.priceRefs.pro).toMatchObject({ stripe: "price_new", razorpay: "plan_new" });
    expect(cfg.priceRefs.pro.previous).toEqual(expect.arrayContaining(["price_pro", "plan_pro"]));
    const actions = (await audit()).map((a) => a.action);
    expect(actions).toEqual(["billing.price.changed", "billing.price.change_requested"]);

    // A retry of the same submission creates nothing new.
    calls.length = 0;
    await pricesRoute.POST(req("POST", input));
    expect(posts("/v1/prices")).toHaveLength(0);
    expect(posts("/v1/plans")).toHaveLength(0);
  });

  it("a subscriber on Max's old price keeps Max after a price change", async () => {
    stripeOn();
    providers([
      { match: is("GET", "/prices/price_max"), json: PRICE_MAX },
      { match: is("POST", "/prices"), json: { id: "price_max_2" } },
    ]);
    asAdmin();
    expect((await pricesRoute.POST(req("POST", { plan: "max", amountMinor: 149_900, currency: "INR", requestId: "req-max-0001" }))).status).toBe(201);
    const cfg = await getPlansConfig();
    expect(planForRef("price_max", cfg)).toBe("max");
    expect(planForRef("price_max_2", cfg)).toBe("max");
  });

  it("all or nothing: a Razorpay refusal leaves the plan on its current prices, and Stripe's error text never reaches the admin", async () => {
    stripeOn();
    razorpayOn();
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: (c) => is("POST", "/prices")(c) && c.url.includes("stripe"), json: { id: "price_new" } },
      { match: (c) => c.url.includes("razorpay"), json: { error: { description: "bad key rzp_secret" } }, status: 401 },
    ]);
    asAdmin();
    const res = await pricesRoute.POST(req("POST", { plan: "pro", amountMinor: 59_900, currency: "INR", requestId: "req-12345679" }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/rzp_secret|sk_test/);
    const cfg = await getPlansConfig();
    expect(cfg.priceRefs.pro.stripe).toBe("price_pro");
    expect(cfg.plans.pro.priceMinor).toBe(49_900);
    expect((await audit())[0].action).toBe("billing.price.change_failed");
  });

  it("with no provider connected, there's nothing to change", async () => {
    providers([]);
    asAdmin();
    const res = await pricesRoute.POST(req("POST", { plan: "pro", amountMinor: 59_900, currency: "INR", requestId: "req-12345670" }));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("an existing price id sets the displayed price from what the provider charges", async () => {
    stripeOn();
    providers([{ match: is("GET", "/prices/price_other"), json: { ...PRICE_PRO, id: "price_other", unit_amount: 39_900 } }]);
    asAdmin();
    expect((await pricesRoute.PUT(req("PUT", { plan: "pro", provider: "stripe", ref: "price_other" }))).status).toBe(200);
    const cfg = await getPlansConfig();
    expect(cfg.priceRefs.pro.stripe).toBe("price_other");
    expect(cfg.plans.pro.priceMinor).toBe(39_900);
  });
});

/* ---------------------------------------------------------- promo codes */

const COUPON = { id: "co_1", percent_off: 20, amount_off: null, currency: null, duration: "once", valid: true, applies_to: { products: ["prod_pro", "prod_max"] }, times_redeemed: 0 };

describe("promo codes", () => {
  const routes = () =>
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: is("GET", "/prices/price_max"), json: PRICE_MAX },
      { match: is("POST", "/coupons"), json: { id: "co_1" } },
      { match: is("POST", "/promotion_codes"), json: { id: "promo_1Abc", code: "LAUNCH20", active: true, times_redeemed: 0, max_redemptions: 50, coupon: COUPON } },
      { match: is("POST", "/promotion_codes/promo_1Abc"), json: { id: "promo_1Abc", active: false } },
      { match: is("GET", "/promotion_codes"), json: { data: [{ id: "promo_1Abc", code: "LAUNCH20", active: true, times_redeemed: 7, max_redemptions: 50, coupon: COUPON }] } },
    ]);

  it("creates a coupon limited to the plans' products, then its promotion code — both idempotent and audited", async () => {
    stripeOn();
    routes();
    asAdmin();
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const res = await promosRoute.POST(req("POST", { code: "launch20", discount: { kind: "percent", percentOff: 20 }, duration: "once", plans: ["pro", "max"], maxRedemptions: 50, expiresAt, requestId: "req-promo-01" }));
    expect(res.status).toBe(201);
    const mutations = calls.filter((c) => c.method === "POST").map((c) => c.url.replace("https://api.stripe.com/v1", ""));
    expect(mutations).toEqual(["/coupons", "/promotion_codes"]);
    const [coupon] = posts("/coupons");
    expect(coupon.body).toContain("percent_off=20");
    expect(coupon.body).toContain("duration=once");
    expect(coupon.body).toContain("applies_to[products][0]=prod_pro");
    expect(coupon.body).toContain("applies_to[products][1]=prod_max");
    expect(coupon.headers["idempotency-key"]).toMatch(/^promo:LAUNCH20:[0-9a-f]{12}:req-promo-01:coupon$/);
    const [promo] = posts("/promotion_codes");
    expect(promo.body).toContain("coupon=co_1");
    expect(promo.body).toContain("code=LAUNCH20");
    expect(promo.body).toContain("max_redemptions=50");
    expect(promo.body).toContain(`expires_at=${Math.floor(Date.parse(expiresAt) / 1000)}`);
    expect(promo.headers["idempotency-key"]).toMatch(/^promo:LAUNCH20:[0-9a-f]{12}:req-promo-01:promotion_code$/);
    expect(promo.headers["stripe-version"]).toBe("2024-06-20");
    expect((await audit()).map((a) => a.action)).toEqual(["billing.promo.created", "billing.promo.create_requested"]);
  });

  it("lists codes with Stripe's own redemption counts and the plans they apply to", async () => {
    stripeOn();
    routes();
    asAdmin();
    const body = await (await discountsRoute.GET(req("GET"))).json();
    expect(body.promos).toEqual([expect.objectContaining({ id: "promo_1Abc", code: "LAUNCH20", timesRedeemed: 7, maxRedemptions: 50, plans: ["pro", "max"] })]);
  });

  it.each([
    ["a too-short code", { code: "ab" }],
    ["0% off", { discount: { kind: "percent", percentOff: 0 } }],
    ["a fractional amount", { discount: { kind: "amount", amountOffMinor: 10.5, currency: "INR" } }],
    ["an expiry in the past", { expiresAt: "2020-01-01T00:00:00.000Z" }],
    ["repeating without months", { duration: "repeating" }],
  ])("refuses %s before calling Stripe", async (_n, patch) => {
    stripeOn();
    routes();
    asAdmin();
    const res = await promosRoute.POST(req("POST", { code: "LAUNCH20", discount: { kind: "percent", percentOff: 20 }, duration: "once", plans: ["pro"], requestId: "req-promo-02", ...patch }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuses an amount off in a currency the plan isn't charged in", async () => {
    stripeOn();
    routes();
    asAdmin();
    const res = await promosRoute.POST(req("POST", { code: "TENOFF", discount: { kind: "amount", amountOffMinor: 1000, currency: "USD" }, duration: "forever", plans: ["pro"], requestId: "req-promo-03" }));
    expect(res.status).toBe(400);
    expect(posts("/coupons")).toHaveLength(0);
  });

  it("deactivates (Stripe can't delete a promotion code) and audits it", async () => {
    stripeOn();
    routes();
    asAdmin();
    const res = await promosRoute.PATCH(req("PATCH", { id: "promo_1Abc", active: false }));
    expect(res.status).toBe(200);
    const [call] = posts("/promotion_codes/promo_1Abc");
    expect(call.body).toBe("active=false");
    expect((await audit()).map((a) => a.action)).toEqual(["billing.promo.deactivated", "billing.promo.deactivate_requested"]);
  });

  it("makes no Stripe call when the audit trail can't be written", async () => {
    stripeOn();
    routes();
    asAdmin();
    vi.spyOn(jobsLakeStore(), "appendAudit").mockRejectedValue(new Error("db down"));
    const res = await promosRoute.PATCH(req("PATCH", { id: "promo_1Abc", active: false }));
    expect(res.status).toBe(503);
    expect(posts("/promotion_codes/promo_1Abc")).toHaveLength(0);
  });
});

/* -------------------------------------------------- checkout and plan cards */

const checkoutBody = () => calls.find((c) => c.url.endsWith("/checkout/sessions"))!.body;

describe("checkout discounts", () => {
  const checkoutRoutes = (activePromos: unknown[], coupon: unknown = { ...COUPON, id: "co_auto", applies_to: { products: ["prod_pro"] } }) =>
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: is("GET", "/promotion_codes"), json: { data: activePromos } },
      { match: is("GET", "/coupons/co_auto"), json: coupon },
      { match: is("POST", "/checkout/sessions"), json: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" } },
    ]);
  const checkout = () => startCheckout({ tenantId: "t-buy", provider: "stripe", origin: "https://x", plan: "pro" });

  it("hides the promotion-code field when no code is active", async () => {
    stripeOn();
    checkoutRoutes([]);
    await checkout();
    expect(checkoutBody()).toContain("allow_promotion_codes=false");
    expect(checkoutBody()).not.toContain("discounts");
  });

  it("shows it when at least one code is active", async () => {
    stripeOn();
    checkoutRoutes([{ id: "promo_1Abc" }]);
    await checkout();
    expect(checkoutBody()).toContain("allow_promotion_codes=true");
  });

  it("applies a valid automatic discount — and then omits allow_promotion_codes, which Stripe forbids alongside it", async () => {
    stripeOn();
    await writeAdminState({ automatic: { pro: { couponId: "co_auto", setAt: "2026-10-09T00:00:00.000Z", setBy: ADMIN } } });
    checkoutRoutes([{ id: "promo_1Abc" }]);
    await checkout();
    expect(checkoutBody()).toContain("discounts[0][coupon]=co_auto");
    expect(checkoutBody()).not.toContain("allow_promotion_codes");
  });

  it("ignores an automatic coupon Stripe says is no longer valid", async () => {
    stripeOn();
    await writeAdminState({ automatic: { pro: { couponId: "co_auto", setAt: "2026-10-09T00:00:00.000Z", setBy: ADMIN } } });
    checkoutRoutes([], { ...COUPON, id: "co_auto", valid: false });
    await checkout();
    expect(checkoutBody()).not.toContain("discounts");
    expect(checkoutBody()).toContain("allow_promotion_codes=false");
  });

  it("plan cards get the discounted price only from a valid coupon that applies to that plan", async () => {
    stripeOn();
    await writeAdminState({ automatic: { pro: { couponId: "co_auto", setAt: "2026-10-09T00:00:00.000Z", setBy: ADMIN }, max: { couponId: "co_auto", setAt: "2026-10-09T00:00:00.000Z", setBy: ADMIN } } });
    checkoutRoutes([]);
    calls = [];
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: is("GET", "/prices/price_max"), json: PRICE_MAX },
      { match: is("GET", "/coupons/co_auto"), json: { ...COUPON, id: "co_auto", applies_to: { products: ["prod_pro"] } } },
    ]);
    const d = await planDiscounts(await getPlansConfig());
    expect(d.pro).toEqual({ regularMinor: 49_900, amountMinor: 39_920, currency: "INR", duration: "once", durationInMonths: null });
    expect(d.max).toBeUndefined();
  });

  it("setting an automatic discount creates a coupon for the plan's product, idempotently, and audits it", async () => {
    stripeOn();
    providers([
      { match: is("GET", "/prices/price_pro"), json: PRICE_PRO },
      { match: is("GET", "/prices/price_max"), json: PRICE_MAX },
      { match: is("POST", "/coupons"), json: { id: "co_auto" } },
      { match: is("GET", "/coupons/co_auto"), json: { ...COUPON, id: "co_auto", percent_off: 10, applies_to: { products: ["prod_pro"] } } },
      { match: is("GET", "/promotion_codes"), json: { data: [] } },
    ]);
    asAdmin();
    const res = await automaticRoute.POST(req("POST", { plan: "pro", discount: { kind: "percent", percentOff: 10 }, duration: "repeating", durationInMonths: 3, requestId: "req-auto-001" }));
    expect(res.status).toBe(201);
    const [coupon] = posts("/coupons");
    expect(coupon.body).toContain("applies_to[products][0]=prod_pro");
    expect(coupon.body).toContain("duration=repeating");
    expect(coupon.body).toContain("duration_in_months=3");
    expect(coupon.headers["idempotency-key"]).toMatch(/^auto:pro:[0-9a-f]{12}:req-auto-001:coupon$/);
    expect((await audit()).map((a) => a.action)).toEqual(["billing.discount.set", "billing.discount.set_requested"]);
    expect((await automaticRoute.DELETE(req("DELETE", { plan: "pro" }))).status).toBe(200);
    expect((await audit())[0].action).toBe("billing.discount.cleared");
  });
});

/* ------------------------------------------------------------ JobsLake API */

describe("JobsLake API pricing", () => {
  it("stored settings take precedence over the environment; unknown sources are refused", async () => {
    vi.stubEnv("JOBSLAKE_API_FREE_SEARCHES", "250");
    providers([]);
    expect((await currentApiPlan()).freeMonthly).toBe(250);
    asAdmin();
    expect((await apiPlanRoute.PUT(req("PUT", { freeMonthly: 500, maxMonthly: 1000, sourceIds: ["nope"] }))).status).toBe(400);
    const res = await apiPlanRoute.PUT(req("PUT", { freeMonthly: 500, maxMonthly: 1000, sourceIds: ["greenhouse", "lever"] }));
    expect(res.status).toBe(200);
    __resetApiPlanCache();
    expect(await currentApiPlan()).toEqual({ freeMonthly: 500, maxMonthly: 1000 });
    expect(apiSourceIds()).toEqual(["greenhouse", "lever"]);
    const [entry] = await audit();
    expect(entry).toMatchObject({ action: "billing.api_plan.saved", actor: ADMIN, detail: { changes: [{ field: "freeMonthly", from: 250, to: 500 }, { field: "maxMonthly", from: 100_000, to: 1000 }] } });
  });

  it("sources: stored choice, then JOBSLAKE_API_SOURCE_IDS, then the built-in ATS sources", () => {
    expect(apiSourceIds({ JOBSLAKE_API_SOURCE_IDS: "lever" }, { sourceIds: ["ashby"] })).toEqual(["ashby"]);
    expect(apiSourceIds({ JOBSLAKE_API_SOURCE_IDS: "lever" }, undefined)).toEqual(["lever"]);
    expect(apiSourceIds({}, { sourceIds: [] })).toContain("greenhouse");
  });

  it("refuses a cap below the free allowance", async () => {
    asAdmin();
    expect((await apiPlanRoute.PUT(req("PUT", { freeMonthly: 500, maxMonthly: 10, sourceIds: ["greenhouse"] }))).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ history */

describe("history", () => {
  it("lists billing-admin changes, newest first", async () => {
    asAdmin();
    await plansRoute.PUT(req("PUT", { plans: { free: { aiDraftsPerMonth: 6 } } }));
    const body = await (await historyRoute.GET(req("GET"))).json();
    expect(body.events[0]).toMatchObject({ actor: ADMIN, action: "billing.plans.saved" });
  });
});
