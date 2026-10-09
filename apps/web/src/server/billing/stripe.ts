import type { PlanPrice, SubscriptionStatus } from "@/domain/billing/types";
import { normalizeStripeStatus } from "@/domain/billing/events";
import { hmacSha256Hex, safeEqual } from "../crypto";
import type { StripeConfig } from "./config";

/**
 * Stripe over its REST API (no SDK: one fewer dependency in the supply chain).
 * Card details are entered on Stripe's hosted Checkout page and never reach
 * WonderJobs servers, which keeps the deployment in PCI DSS SAQ A scope.
 */
const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 15_000;

/** What a candidate may be told about a provider failure: never the provider's own text. */
export function describeProviderError(e: unknown, name: "Stripe" | "Razorpay"): string {
  const status = e instanceof ProviderError ? e.status : 0;
  if (status === 401 || status === 403) return `${name} rejected this deployment's credentials`;
  if (status === 404) return `The Pro plan configured for ${name} wasn't found`;
  if (status === 400) return `${name} refused the request`;
  if (status === 429) return `${name} is rate-limiting requests; try again shortly`;
  return `${name} couldn't be reached`;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Stripe's form encoding, including nested keys (`a[b][c]=v`). */
export function formEncode(params: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

/**
 * One Stripe API call. Exported for the JobsLake API's metered billing (server/jobslake/apiBilling.ts) and
 * billing administration (server/billing/admin.ts). `stripeVersion` pins the API version for calls whose
 * shape changed between versions (promotion codes); otherwise the account's default applies.
 */
export async function stripeCall<T>(cfg: Pick<StripeConfig, "secretKey">, method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string, stripeVersion?: string): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${cfg.secretKey}` };
  if (body) headers["content-type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  if (stripeVersion) headers["stripe-version"] = stripeVersion;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? formEncode(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  // Stripe's own message can quote the API key ("Invalid API Key provided: sk_…"), so it is logged
  // server-side only; callers get a fixed description from `describeProviderError`.
  if (!res.ok) {
    console.error(`[billing] Stripe ${method} ${path.split("?")[0]} → ${res.status}`);
    throw new ProviderError(`Stripe answered ${res.status}`, res.status);
  }
  return json;
}

interface StripePrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  active: boolean;
  recurring: { interval: PlanPrice["interval"]; interval_count: number } | null;
  product: { name?: string; description?: string | null } | string;
}

export async function stripePrice(cfg: StripeConfig): Promise<PlanPrice> {
  const p = await stripeCall<StripePrice>(cfg, "GET", `/prices/${encodeURIComponent(cfg.priceId)}?expand[]=product`);
  if (!p.recurring || p.unit_amount == null) throw new ProviderError("STRIPE_PRICE_ID must be a recurring price with a fixed amount", 400);
  if (!p.active) throw new ProviderError("The configured Stripe price is archived", 400);
  const product = typeof p.product === "object" ? p.product : {};
  return {
    provider: "stripe",
    ref: p.id,
    name: product.name ?? "Pro",
    description: product.description ?? undefined,
    amount: p.unit_amount,
    currency: p.currency.toUpperCase(),
    interval: p.recurring.interval,
    intervalCount: p.recurring.interval_count,
  };
}

/**
 * Hosted Checkout for a plan. Stripe refuses `discounts` together with `allow_promotion_codes` in one
 * session, so an automatic discount (a coupon applied to every new checkout of the plan) replaces the
 * promotion-code field; without one, the field shows only while at least one promotion code is active.
 */
export async function stripeCheckout(cfg: StripeConfig, input: { tenantId: string; email?: string; successUrl: string; cancelUrl: string; idempotencyKey: string; couponId?: string; allowPromotionCodes?: boolean }): Promise<{ id: string; url: string }> {
  const s = await stripeCall<{ id: string; url: string }>(
    cfg,
    "POST",
    "/checkout/sessions",
    {
      mode: "subscription",
      line_items: { 0: { price: cfg.priceId, quantity: 1 } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.tenantId,
      customer_email: input.email,
      metadata: { tenant_id: input.tenantId },
      subscription_data: { metadata: { tenant_id: input.tenantId } },
      ...(input.couponId ? { discounts: { 0: { coupon: input.couponId } } } : { allow_promotion_codes: input.allowPromotionCodes ? "true" : "false" }),
    },
    input.idempotencyKey,
  );
  if (!s.url) throw new ProviderError("Stripe did not return a checkout URL", 502);
  return s;
}

/** Stripe's hosted customer portal: update card, download invoices, cancel. */
export async function stripePortal(cfg: StripeConfig, customerId: string, returnUrl: string): Promise<string> {
  const s = await stripeCall<{ url: string }>(cfg, "POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return s.url;
}

export async function stripeSubscriptionStatus(cfg: StripeConfig, subscriptionId: string): Promise<{ status: SubscriptionStatus; cancelAtPeriodEnd: boolean; raw: string }> {
  const s = await stripeCall<{ status: string; cancel_at_period_end: boolean; cancel_at: number | null }>(cfg, "GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  // Same reading as the webhook (`fromStripeEvent`): a scheduled `cancel_at` is a cancellation too.
  return { status: normalizeStripeStatus(s.status), cancelAtPeriodEnd: !!s.cancel_at_period_end || s.cancel_at != null, raw: s.status };
}

/**
 * Verify a `Stripe-Signature` header: `t=<unix>,v1=<hex hmac of "t.payload">[,v1=…]`.
 * Rejects signatures older than `toleranceSec` (replay protection).
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = hmacSha256Hex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}
