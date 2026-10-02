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

async function call<T>(cfg: RazorpayConfig, method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
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

export async function razorpayPlan(cfg: RazorpayConfig): Promise<PlanPrice> {
  const p = await call<{ id: string; period: string; interval: number; item: { name: string; description?: string | null; amount: number; currency: string; active?: boolean } }>(cfg, "GET", `/plans/${encodeURIComponent(cfg.planId)}`);
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

export async function razorpaySubscribe(cfg: RazorpayConfig, input: { tenantId: string }): Promise<{ id: string; url: string }> {
  const s = await call<{ id: string; short_url?: string }>(cfg, "POST", "/subscriptions", {
    plan_id: cfg.planId,
    total_count: cfg.totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: { tenant_id: input.tenantId },
  });
  if (!s.short_url) throw new ProviderError("Razorpay did not return a payment link", 502);
  return { id: s.id, url: s.short_url };
}

/** Cancel at the end of the paid cycle: the candidate keeps what they paid for. */
export async function razorpayCancelAtCycleEnd(cfg: RazorpayConfig, subscriptionId: string): Promise<void> {
  await call(cfg, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
}

/** Cancel now — used only for a subscription that never took a payment. */
export async function razorpayCancelNow(cfg: RazorpayConfig, subscriptionId: string): Promise<void> {
  await call(cfg, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 0 });
}

export async function razorpaySubscriptionStatus(cfg: RazorpayConfig, subscriptionId: string): Promise<{ status: SubscriptionStatus; cancelAtPeriodEnd: boolean; raw: string }> {
  const s = await call<{ status: string; has_scheduled_changes?: boolean }>(cfg, "GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return { status: normalizeRazorpayStatus(s.status), cancelAtPeriodEnd: !!s.has_scheduled_changes, raw: s.status };
}

/** `X-Razorpay-Signature` is the hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyRazorpaySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  return safeEqual(header.trim(), hmacSha256Hex(secret, payload));
}
