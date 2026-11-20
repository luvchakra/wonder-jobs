import type { PlanPrice, SubscriptionStatus } from "@/domain/billing/types";
import { normalizeRazorpayStatus } from "@/domain/billing/events";
import { hmacSha256Hex, safeEqual } from "../crypto";
import type { RazorpayConfig } from "./config";
import { ProviderError } from "./stripe";

/**
 * Razorpay over its REST API. Subscriptions are paid on Razorpay's hosted
 * page (`short_url`): UPI AutoPay, cards (RBI e-mandate with additional
 * factor authentication) and net banking are handled entirely by Razorpay.
 */
const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

/** One Razorpay API call; its own error text is logged server-side only. */
export async function razorpayCall<T>(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">, method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    console.error(`[billing] Razorpay ${method} ${path} → ${res.status}`);
    throw new ProviderError(`Razorpay answered ${res.status}`, res.status);
  }
  return json;
}

const PERIOD: Record<string, PlanPrice["interval"]> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

export async function razorpayPlan(cfg: RazorpayConfig & { planId: string }): Promise<PlanPrice> {
  const p = await razorpayCall<{ id: string; period: string; interval: number; item: { name: string; description?: string | null; amount: number; currency: string; active?: boolean } }>(cfg, "GET", `/plans/${encodeURIComponent(cfg.planId)}`);
  const interval = PERIOD[p.period];
  if (!interval) throw new ProviderError(`Unsupported Razorpay plan period "${p.period}"`, 400);
  return {
    provider: "razorpay",
    ref: p.id,
    name: p.item.name || "Pro",
    description: p.item.description ?? undefined,
    amount: p.item.amount,
    currency: p.item.currency.toUpperCase(),
    interval,
    intervalCount: p.interval,
  };
}

export async function razorpaySubscribe(cfg: RazorpayConfig & { planId: string }, input: { tenantId: string }): Promise<{ id: string; url: string }> {
  const s = await razorpayCall<{ id: string; short_url?: string }>(cfg, "POST", "/subscriptions", {
    plan_id: cfg.planId,
    total_count: cfg.totalCount,
    quantity: 1,
    customer_notify: 1,
    // An abandoned payment link expires after a week instead of lingering as an open subscription.
    expire_by: Math.floor(Date.now() / 1000) + 7 * 86_400,
    notes: { tenant_id: input.tenantId },
  });
  if (!s.short_url) throw new ProviderError("Razorpay did not return a payment link", 502);
  return { id: s.id, url: s.short_url };
}

/** Cancel at the end of the paid cycle: the candidate keeps what they paid for. */
export async function razorpayCancelAtCycleEnd(cfg: RazorpayConfig, subscriptionId: string): Promise<void> {
  await razorpayCall(cfg, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
}

/** Cancel now — used only for a subscription that never took a payment. */
export async function razorpayCancelNow(cfg: RazorpayConfig, subscriptionId: string): Promise<void> {
  await razorpayCall(cfg, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 0 });
}

export async function razorpaySubscriptionStatus(cfg: RazorpayConfig, subscriptionId: string): Promise<{ status: SubscriptionStatus; cancelAtPeriodEnd: boolean; raw: string }> {
  const s = await razorpayCall<{ status: string; has_scheduled_changes?: boolean }>(cfg, "GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return { status: normalizeRazorpayStatus(s.status), cancelAtPeriodEnd: !!s.has_scheduled_changes, raw: s.status };
}

/**
 * Checks a key pair by listing one plan (a read that changes nothing). Throws a ProviderError with Razorpay's status:
 * 401 means the Key ID and secret don't match.
 */
export async function razorpayCheckKeys(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">): Promise<void> {
  // Payments is open to every account; Plans is not (it needs Razorpay's Subscriptions product, else 401), so it can't
  // tell good keys from bad (owner's test keys, 2026-11-06: /payments 200, /plans 401).
  await razorpayCall(cfg, "GET", "/payments?count=1");
}

const SUBS_TTL_MS = 10 * 60_000;
const subsCache = new Map<string, { at: number; enabled: boolean }>();

/**
 * Whether the account has Razorpay's Subscriptions product (UPI AutoPay and card mandates that renew by themselves).
 * Without it, its Plans API answers 401 even with good keys, and plans are paid a month at a time through orders.
 * Undefined when Razorpay couldn't be asked; cached for ten minutes per key.
 */
export async function razorpaySubscriptionsEnabled(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">, now = Date.now()): Promise<boolean | undefined> {
  const hit = subsCache.get(cfg.keyId);
  if (hit && now - hit.at < SUBS_TTL_MS) return hit.enabled;
  try {
    await razorpayCall(cfg, "GET", "/plans?count=1");
    subsCache.set(cfg.keyId, { at: now, enabled: true });
    return true;
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403 || e.status === 400 || e.status === 404)) {
      subsCache.set(cfg.keyId, { at: now, enabled: false });
      return false;
    }
    return undefined;
  }
}

/** Tests and key changes: forget what was learnt about each key's Subscriptions product. */
export function clearRazorpaySubscriptionsCache() {
  subsCache.clear();
}

/** A Razorpay order for one payment (Standard Checkout). `amount` is in the currency's smallest unit (paise); at least 100. */
export async function razorpayCreateOrder(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">, input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amount: number; currency: string }> {
  if (!Number.isInteger(input.amount) || input.amount < 100) throw new ProviderError("An order is at least 100 paise", 400);
  const o = await razorpayCall<{ id?: string; amount?: number; currency?: string }>(cfg, "POST", "/orders", { amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes });
  if (!o.id) throw new ProviderError("Razorpay returned no order id", 502);
  return { id: o.id, amount: o.amount ?? input.amount, currency: (o.currency ?? input.currency).toUpperCase() };
}

export interface RazorpayOrder {
  id: string;
  status: string;
  amount: number;
  amountPaid: number;
  currency: string;
  notes: Record<string, string>;
  /** Unix seconds. */
  createdAt?: number;
}

export async function razorpayOrder(cfg: Pick<RazorpayConfig, "keyId" | "keySecret">, orderId: string): Promise<RazorpayOrder> {
  const o = await razorpayCall<{ id: string; status: string; amount: number; amount_paid?: number; currency: string; notes?: Record<string, string> | unknown[]; created_at?: number }>(cfg, "GET", `/orders/${encodeURIComponent(orderId)}`);
  return { id: o.id, status: o.status, amount: o.amount, amountPaid: o.amount_paid ?? 0, currency: (o.currency ?? "").toUpperCase(), notes: o.notes && !Array.isArray(o.notes) ? (o.notes as Record<string, string>) : {}, createdAt: o.created_at };
}

/** Standard Checkout's signature for an order: hex HMAC-SHA256 of `<order id>|<payment id>` with the Key secret. */
export function verifyRazorpayOrder(input: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean {
  if (!input.orderId || !input.paymentId || !input.signature || !keySecret) return false;
  return safeEqual(input.signature.trim(), hmacSha256Hex(keySecret, `${input.orderId}|${input.paymentId}`));
}

/**
 * Whether Razorpay knows this Key ID, asked without the secret: its checkout's public preferences endpoint answers 200
 * for a real key and 401 for an unknown one. Tells "wrong Key ID" from "wrong secret" when a pair is refused.
 * Undefined when Razorpay couldn't be asked.
 */
export async function razorpayKeyIdExists(keyId: string): Promise<boolean | undefined> {
  try {
    const res = await fetch(`${API}/preferences?key_id=${encodeURIComponent(keyId)}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (res.ok) return true;
    return res.status === 401 || res.status === 400 ? false : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The signature Razorpay's checkout hands back after a subscription's first payment: the hex HMAC-SHA256 of
 * `<payment id>|<subscription id>` with the Key secret. Proves the payment came from Razorpay for this subscription;
 * the plan still changes only from what Razorpay then reports for the subscription itself.
 */
export function verifyRazorpayCheckout(input: { paymentId: string; subscriptionId: string; signature: string }, keySecret: string): boolean {
  if (!input.paymentId || !input.subscriptionId || !input.signature || !keySecret) return false;
  return safeEqual(input.signature.trim(), hmacSha256Hex(keySecret, `${input.paymentId}|${input.subscriptionId}`));
}

/** `X-Razorpay-Signature` is the hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyRazorpaySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  return safeEqual(header.trim(), hmacSha256Hex(secret, payload));
}
