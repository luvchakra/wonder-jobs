/**
 * JobsLake API pay-as-you-go: Stripe metered billing, separate from the candidate's Pro/Max plan.
 *
 * - Configured only with STRIPE_SECRET_KEY + STRIPE_API_PRICE_ID (a metered recurring price on a
 *   Stripe Billing Meter) and STRIPE_API_METER_EVENT (the meter's event name). Without them the free
 *   allowance is a hard stop and the UI says pay-as-you-go isn't available.
 * - Everything is marked metadata purpose="jobslake_api", and `fromStripeEvent` ignores such events,
 *   so an API subscription can never grant Pro.
 * - Turning it on: hosted Stripe Checkout; the return route re-reads the session from Stripe and checks
 *   it belongs to the signed-in account before storing anything.
 * - The daily cron re-reads every subscription's status (fail closed: unreadable = not active), then
 *   reports each complete day's overage as one meter event whose identifier `jl:{owner}:{day}` is also
 *   the idempotency key — a rerun never bills a day twice.
 * - The price is read from Stripe, never set here.
 */
import { JOBSLAKE_API_PURPOSE, normalizeStripeStatus } from "@/domain/billing/events";
import { monthStart, overageReports, utcDay } from "@/domain/jobslake/apiPlan";
import { recordServerAudit } from "@/server/audit";
import { ProviderError, describeProviderError, stripeCall } from "@/server/billing/stripe";
import { apiStore, type ApiBillingRecord } from "./apiStore";
import { apiSourceIds } from "./developer";
import { currentApiPlan } from "./apiPlanSettings";

export interface ApiBillingConfig {
  secretKey: string;
  priceId: string;
  meterEvent: string;
}

export function apiBillingConfig(env: Record<string, string | undefined> = process.env): ApiBillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const priceId = env.STRIPE_API_PRICE_ID?.trim();
  if (!secretKey || !priceId) return null;
  return { secretKey, priceId, meterEvent: env.STRIPE_API_METER_EVENT?.trim() || "jobslake_api_search" };
}

export class ApiBillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiBillingError";
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const ref = (v: unknown): string | undefined => str(v) ?? str(obj(v).id);

/* ---------------------------------------------------------------- price */

export interface ApiPrice {
  /** Price per `perUnits` units, in the currency's minor unit (may be fractional, e.g. "0.5"). */
  unitAmountDecimal: string;
  currency: string;
  perUnits: number;
  productName?: string;
}

const PRICE_TTL_MS = 10 * 60_000;
let priceCache: { key: string; at: number; price: ApiPrice } | null = null;

/** The metered price as Stripe has it. Throws when it isn't a per-unit metered price — nothing is guessed. */
export async function apiPrice(cfg: ApiBillingConfig): Promise<ApiPrice> {
  const key = `${cfg.priceId}:${cfg.secretKey.slice(-6)}`;
  if (priceCache && priceCache.key === key && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.price;
  const p = await stripeCall<Obj>(cfg, "GET", `/prices/${encodeURIComponent(cfg.priceId)}?expand[]=product`);
  const recurring = obj(p.recurring);
  if (recurring.usage_type !== "metered") throw new ProviderError("STRIPE_API_PRICE_ID must be a metered recurring price", 400);
  if (p.billing_scheme && p.billing_scheme !== "per_unit") throw new ProviderError("STRIPE_API_PRICE_ID must be a per-unit price", 400);
  if (p.active === false) throw new ProviderError("The configured JobsLake API price is archived", 400);
  const amount = str(p.unit_amount_decimal) ?? (typeof p.unit_amount === "number" ? String(p.unit_amount) : undefined);
  const currency = str(p.currency);
  if (!amount || !currency) throw new ProviderError("The configured JobsLake API price has no per-unit amount", 400);
  const divideBy = Number(obj(p.transform_quantity).divide_by);
  const price: ApiPrice = { unitAmountDecimal: amount, currency: currency.toUpperCase(), perUnits: Number.isInteger(divideBy) && divideBy > 1 ? divideBy : 1, productName: str(obj(p.product).name) };
  priceCache = { key, at: Date.now(), price };
  return price;
}

/** Tests only. */
export function __clearApiPriceCache() {
  priceCache = null;
}

/* ------------------------------------------------------- status for the UI */

export interface ApiAccountStatus {
  month: string;
  usedThisMonth: number;
  freeMonthly: number;
  sources: string[];
  billing: { state: "active"; enabledAt?: string; price: ApiPrice | null } | { state: "available"; price: ApiPrice } | { state: "unavailable"; reason: string };
}

/** What the Account page shows: real counts from the usage table, the price as Stripe has it. */
export async function apiAccountStatus(ownerId: string, now = new Date()): Promise<ApiAccountStatus> {
  const today = utcDay(now);
  const store = apiStore();
  const [rows, billing] = await Promise.all([store.usage(ownerId, monthStart(today)), store.getBilling(ownerId)]);
  const usedThisMonth = rows.filter((r) => r.day <= today).reduce((s, r) => s + r.units, 0);
  const cfg = apiBillingConfig();
  let price: ApiPrice | null = null;
  let priceProblem: string | undefined;
  if (cfg) {
    try {
      price = await apiPrice(cfg);
    } catch (e) {
      priceProblem = e instanceof ProviderError && e.status === 400 ? e.message : describeProviderError(e, "Stripe");
    }
  }
  const { freeMonthly } = await currentApiPlan();
  const base = { month: today.slice(0, 7), usedThisMonth, freeMonthly, sources: apiSourceIds() };
  let active = billing?.status === "active";
  // Cancelled in Stripe's portal since the last daily check: turn it off now. (A failed read here is
  // left to the daily report, which treats it as not active.)
  if (active && cfg && billing?.stripeSubscriptionId) {
    const still = await subscriptionActive(cfg, billing.stripeSubscriptionId).catch(() => true);
    if (!still) {
      await store.putBilling({ ...billing, status: "inactive", updatedAt: new Date().toISOString() });
      active = false;
    }
  }
  if (active) return { ...base, billing: { state: "active", enabledAt: billing?.enabledAt, price } };
  if (!cfg) return { ...base, billing: { state: "unavailable", reason: "Pay-as-you-go isn't available yet" } };
  if (!price) return { ...base, billing: { state: "unavailable", reason: priceProblem ?? "Pay-as-you-go isn't available yet" } };
  return { ...base, billing: { state: "available", price } };
}

/* -------------------------------------------------------------- checkout */

export async function startApiCheckout(input: { ownerId: string; email?: string; origin: string }): Promise<{ url: string }> {
  const cfg = apiBillingConfig();
  if (!cfg) throw new ApiBillingError("Pay-as-you-go isn't available yet", 503);
  const existing = await apiStore().getBilling(input.ownerId);
  if (existing?.status === "active") throw new ApiBillingError("Pay-as-you-go is already on for this account", 409);
  const meta = { tenant_id: input.ownerId, purpose: JOBSLAKE_API_PURPOSE };
  const body: Obj = {
    mode: "subscription",
    // Metered: no quantity — usage arrives as meter events.
    line_items: { 0: { price: cfg.priceId } },
    success_url: `${input.origin}/api/jobs-lake/api-billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/app/profile#jobslake-api`,
    client_reference_id: input.ownerId,
    metadata: meta,
    subscription_data: { metadata: meta },
  };
  if (existing?.stripeCustomerId) body.customer = existing.stripeCustomerId;
  else if (input.email) body.customer_email = input.email;
  // Same key for repeated clicks within a minute: a double-click opens one checkout, not two.
  const idempotencyKey = `jlapi-checkout:${input.ownerId}:${Math.floor(Date.now() / 60_000)}`;
  const s = await stripeCall<{ id: string; url?: string }>(cfg, "POST", "/checkout/sessions", body, idempotencyKey);
  if (!s.url) throw new ProviderError("Stripe did not return a checkout URL", 502);
  return { url: s.url };
}

/** Stripe's hosted portal for the account's pay-as-you-go customer: card, invoices, cancel. */
export async function apiBillingPortal(ownerId: string, origin: string): Promise<{ url: string }> {
  const cfg = apiBillingConfig();
  if (!cfg) throw new ApiBillingError("Pay-as-you-go isn't available yet", 503);
  const billing = await apiStore().getBilling(ownerId);
  if (!billing?.stripeCustomerId) throw new ApiBillingError("Pay-as-you-go isn't set up for this account", 404);
  const s = await stripeCall<{ url: string }>(cfg, "POST", "/billing_portal/sessions", { customer: billing.stripeCustomerId, return_url: `${origin}/app/profile#jobslake-api` });
  return { url: s.url };
}

async function subscriptionActive(cfg: ApiBillingConfig, subscriptionId: string): Promise<boolean> {
  const sub = await stripeCall<Obj>(cfg, "GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return normalizeStripeStatus(sub.status) === "active";
}

/**
 * Back from Checkout: the redirect proves nothing on its own, so the session is read from Stripe and
 * must be this account's, for the JobsLake API, and complete. Only then is the subscription stored —
 * and its status is Stripe's, read now.
 */
export async function confirmApiCheckout(ownerId: string, sessionId: string): Promise<ApiBillingRecord> {
  const cfg = apiBillingConfig();
  if (!cfg) throw new ApiBillingError("Pay-as-you-go isn't available yet", 503);
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) throw new ApiBillingError("That checkout link isn't valid", 400);
  const s = await stripeCall<Obj>(cfg, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (str(s.client_reference_id) !== ownerId) throw new ApiBillingError("That checkout belongs to another account", 403);
  if (obj(s.metadata).purpose !== JOBSLAKE_API_PURPOSE || s.mode !== "subscription") throw new ApiBillingError("That checkout isn't for the JobsLake API", 400);
  if (s.status !== "complete" || (s.payment_status !== "paid" && s.payment_status !== "no_payment_required")) throw new ApiBillingError("Checkout isn't complete yet", 409);
  const customer = ref(s.customer);
  const subscription = ref(s.subscription);
  if (!customer || !subscription) throw new ApiBillingError("Stripe didn't return a subscription for that checkout", 502);
  let active = false;
  try {
    active = await subscriptionActive(cfg, subscription);
  } catch {
    active = false; // fail closed; the daily report reads it again
  }
  const now = new Date().toISOString();
  const rec: ApiBillingRecord = { ownerId, stripeCustomerId: customer, stripeSubscriptionId: subscription, status: active ? "active" : "inactive", enabledAt: active ? now : undefined, updatedAt: now };
  await apiStore().putBilling(rec);
  await recordServerAudit(ownerId, { actionId: `jlapi-billing:${subscription}`, actionType: "jobslake_api", event: active ? "payg_enabled" : "payg_pending", detail: `stripe ${subscription}` });
  return rec;
}

/* ---------------------------------------------------------- daily report */

export interface ApiUsageReport {
  configured: boolean;
  accounts: number;
  deactivated: number;
  reported: number;
  units: number;
  failed: number;
}

/**
 * Daily (from the existing cron): re-read each pay-as-you-go subscription from Stripe, then report
 * every complete day's overage still owed as a meter event. A day is marked reported only after
 * Stripe accepts it; its identifier doubles as the idempotency key, so a retry is a no-op at Stripe.
 */
export async function reportApiUsage(now = new Date()): Promise<ApiUsageReport> {
  const out: ApiUsageReport = { configured: false, accounts: 0, deactivated: 0, reported: 0, units: 0, failed: 0 };
  const cfg = apiBillingConfig();
  if (!cfg) return out;
  out.configured = true;
  const store = apiStore();
  const { freeMonthly } = await currentApiPlan();
  const today = utcDay(now);
  const nowSec = Math.floor(now.getTime() / 1000);
  // Stripe accepts meter events up to 35 days old; look back 31 days, from the start of that month so the free allowance is counted right.
  const from = monthStart(utcDay(now.getTime() - 31 * 86_400_000));
  for (const b of await store.listSubscribedBilling()) {
    out.accounts++;
    let active = false;
    try {
      active = await subscriptionActive(cfg, b.stripeSubscriptionId!);
    } catch (e) {
      console.error(`[jobslake-api] subscription status unreadable for one account: ${e instanceof Error ? e.message : "unknown"}`);
      active = false; // fail closed: unknown is not active
    }
    if (active !== (b.status === "active")) {
      await store.putBilling({ ...b, status: active ? "active" : "inactive", enabledAt: active ? (b.enabledAt ?? now.toISOString()) : b.enabledAt, updatedAt: now.toISOString() });
      if (!active) out.deactivated++;
    }
    if (!active || !b.stripeCustomerId) continue;
    const reports = overageReports(b.ownerId, await store.usage(b.ownerId, from), freeMonthly, today).filter((r) => nowSec - r.timestamp < 34 * 86_400);
    for (const r of reports) {
      try {
        await stripeCall(cfg, "POST", "/billing/meter_events", { event_name: cfg.meterEvent, payload: { stripe_customer_id: b.stripeCustomerId, value: String(r.value) }, identifier: r.identifier, timestamp: r.timestamp }, r.identifier);
        await store.markReported(b.ownerId, r.day, r.value);
        await recordServerAudit(b.ownerId, { actionId: r.identifier, actionType: "jobslake_api", event: "usage_reported", detail: `${r.day}: ${r.value} units` });
        console.info(`[jobslake-api] reported ${r.value} unit(s) for ${r.day} (${r.identifier.slice(0, 12)}…)`);
        out.reported++;
        out.units += r.value;
      } catch (e) {
        out.failed++;
        console.error(`[jobslake-api] meter event for ${r.day} not accepted: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }
  return out;
}
