import { applyBillingEvent, entitlementFor } from "@/domain/billing/subscription";
import { fromRazorpayEvent, fromStripeEvent } from "@/domain/billing/events";
import type { BillingEvent, BillingProviderId, Entitlement, PlanPrice, ProviderAvailability, Subscription } from "@/domain/billing/types";
import { sha256Hex } from "../crypto";
import { recordServerAudit } from "../audit";
import { BILLING_PROVIDER_IDS, missingBillingEnv, razorpayConfig, stripeConfig } from "./config";
import { entryFor } from "./ledger";
import { razorpayCancelAtCycleEnd, razorpayCancelNow, razorpayPlan, razorpaySubscribe, razorpaySubscriptionStatus, verifyRazorpaySignature } from "./razorpay";
import { billingStore, currentSubscription } from "./store";
import { ProviderError, describeProviderError, stripeCheckout, stripePortal, stripePrice, stripeSubscriptionStatus, verifyStripeSignature } from "./stripe";

/**
 * Billing orchestration. Application code — never a model — decides every step:
 * - Checkout and payment happen on the provider's hosted page. WonderJobs never sees card or bank details.
 * - Access changes only on a signature-verified provider webhook (or the daily reconciliation that
 *   asks the provider directly). Returning from checkout proves nothing and changes nothing.
 * - Every verified event is appended to the hash-chained ledger before it is applied, and a
 *   redelivered event is recognised by its provider event id, so a retry never applies twice.
 */

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

const PRICE_TTL_MS = 10 * 60_000;
const priceCache = new Map<string, { at: number; price: PlanPrice }>();

async function priceFor(provider: BillingProviderId): Promise<PlanPrice> {
  // Keyed by the configured id too, so changing STRIPE_PRICE_ID / RAZORPAY_PLAN_ID takes effect at once.
  const key = provider === "stripe" ? `stripe:${stripeConfig()!.priceId}:${stripeConfig()!.secretKey.slice(-6)}` : `razorpay:${razorpayConfig()!.planId}:${razorpayConfig()!.keyId}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;
  const price = provider === "stripe" ? await stripePrice(stripeConfig()!) : await razorpayPlan(razorpayConfig()!);
  priceCache.set(key, { at: Date.now(), price });
  return price;
}

/** Tests: forget cached prices. */
export function clearPriceCacheForTests() {
  priceCache.clear();
}

/** Each provider: ready (with the real price read from the provider), needs setup, or unavailable. */
export async function providerAvailability(): Promise<ProviderAvailability[]> {
  return Promise.all(
    BILLING_PROVIDER_IDS.map(async (provider): Promise<ProviderAvailability> => {
      const missing = missingBillingEnv(provider);
      if (missing.length) return { provider, state: "needs_setup", missing };
      try {
        return { provider, state: "ready", price: await priceFor(provider) };
      } catch (e) {
        return { provider, state: "unavailable", reason: e instanceof ProviderError && e.status === 400 ? e.message : describeProviderError(e, provider === "stripe" ? "Stripe" : "Razorpay") };
      }
    }),
  );
}

export async function entitlement(tenantId: string): Promise<Entitlement> {
  try {
    return entitlementFor(currentSubscription(await billingStore().subscriptionsForTenant(tenantId)));
  } catch {
    // Fail closed: if the record can't be read, nothing paid is unlocked, and we say why.
    return { plan: "free", reason: "Your plan couldn't be checked just now" };
  }
}

/** Server-side gate for any feature that Pro unlocks. Never trust a plan sent by the browser. */
export async function hasPro(tenantId: string): Promise<boolean> {
  return (await entitlement(tenantId)).plan === "pro";
}

export async function startCheckout(input: { tenantId: string; email?: string; provider: BillingProviderId; origin: string }): Promise<{ url: string }> {
  const { tenantId, provider, origin } = input;
  const missing = missingBillingEnv(provider);
  if (missing.length) throw new BillingError("This payment provider isn't set up on this deployment yet", 503);
  const subs = await billingStore().subscriptionsForTenant(tenantId);
  if (entitlementFor(currentSubscription(subs)).plan === "pro") throw new BillingError("You already have Pro", 409);
  const back = (state: string) => `${origin}/app/profile?billing=${state}&provider=${provider}#plan`;
  try {
    if (provider === "stripe") {
      // Same key for repeated clicks within a minute, so a double-click opens one checkout, not two.
      const idempotencyKey = `checkout:${tenantId}:${Math.floor(Date.now() / 60_000)}`;
      const s = await stripeCheckout(stripeConfig()!, { tenantId, email: input.email, successUrl: back("success"), cancelUrl: back("cancelled"), idempotencyKey });
      return { url: s.url };
    }
    const cfg = razorpayConfig()!;
    const s = await razorpaySubscribe(cfg, { tenantId });
    // Remember the mapping now so an abandoned subscription can be cancelled on erasure. Its provider time
    // starts at the epoch so every real event from Razorpay is newer than this placeholder.
    await billingStore().saveSubscription({ tenantId, provider: "razorpay", subscriptionId: s.id, planRef: cfg.planId, status: "incomplete", cancelAtPeriodEnd: false, updatedAt: new Date(0).toISOString() });
    return { url: s.url };
  } catch (e) {
    if (e instanceof ProviderError) throw new BillingError(`Checkout couldn't start: ${describeProviderError(e, provider === "stripe" ? "Stripe" : "Razorpay")}`, 502);
    throw e;
  }
}

/** Stripe's hosted portal (card, invoices, cancel). */
export async function openPortal(tenantId: string, returnUrl: string): Promise<{ url: string }> {
  const sub = currentSubscription(await billingStore().subscriptionsForTenant(tenantId));
  const cfg = stripeConfig();
  if (!sub || sub.provider !== "stripe" || !sub.customerId) throw new BillingError("There's no Stripe subscription to manage", 404);
  if (!cfg) throw new BillingError("Stripe isn't set up on this deployment", 503);
  return { url: await stripePortal(cfg, sub.customerId, returnUrl) };
}

/**
 * Cancel a Razorpay subscription at the end of the paid cycle. The change takes effect when
 * Razorpay's webhook confirms it; the request and its result are written to the action audit.
 */
export async function cancelSubscription(tenantId: string): Promise<{ requested: true }> {
  const sub = currentSubscription(await billingStore().subscriptionsForTenant(tenantId));
  if (!sub || sub.status === "canceled") throw new BillingError("There's no active subscription to cancel", 404);
  if (sub.provider === "stripe") throw new BillingError("Stripe subscriptions are managed in Stripe's billing portal", 400);
  if (sub.cancelAtPeriodEnd) return { requested: true };
  const cfg = razorpayConfig();
  if (!cfg) throw new BillingError("Razorpay isn't set up on this deployment", 503);
  const actionId = `cancel:${sub.subscriptionId}`;
  await recordServerAudit(tenantId, { actionId, actionType: "cancel_subscription", event: "requested", detail: `razorpay ${sub.subscriptionId}` });
  try {
    if (sub.status === "incomplete") await razorpayCancelNow(cfg, sub.subscriptionId);
    else await razorpayCancelAtCycleEnd(cfg, sub.subscriptionId);
  } catch (e) {
    await recordServerAudit(tenantId, { actionId, actionType: "cancel_subscription", event: "failed", detail: e instanceof Error ? e.message.slice(0, 200) : "error" });
    throw new BillingError(`Razorpay couldn't cancel the subscription: ${describeProviderError(e, "Razorpay")}`, 502);
  }
  await recordServerAudit(tenantId, { actionId, actionType: "cancel_subscription", event: "succeeded" });
  return { requested: true };
}

export type WebhookResult = { status: 200 | 400 | 401 | 503; body: { received: boolean; duplicate?: boolean; outcome?: string; error?: string } };

/** Verify, ledger, apply. Pure inputs (raw body + headers) so it is testable without HTTP. */
export async function handleWebhook(provider: BillingProviderId, rawBody: string, headers: Headers): Promise<WebhookResult> {
  let event: BillingEvent;
  if (provider === "stripe") {
    const cfg = stripeConfig();
    if (!cfg) return { status: 503, body: { received: false, error: "Stripe is not configured" } };
    if (!verifyStripeSignature(rawBody, headers.get("stripe-signature"), cfg.webhookSecret)) return { status: 401, body: { received: false, error: "Invalid signature" } };
    event = fromStripeEvent(safeJson(rawBody));
  } else {
    const cfg = razorpayConfig();
    if (!cfg) return { status: 503, body: { received: false, error: "Razorpay is not configured" } };
    if (!verifyRazorpaySignature(rawBody, headers.get("x-razorpay-signature"), cfg.webhookSecret)) return { status: 401, body: { received: false, error: "Invalid signature" } };
    // Razorpay's event id travels in a header; without it, fall back to the body's hash so a redelivery still dedupes.
    event = fromRazorpayEvent(safeJson(rawBody), headers.get("x-razorpay-event-id") || `body:${sha256Hex(rawBody)}`);
  }
  if (!event.eventId) return { status: 400, body: { received: false, error: "Event has no id" } };
  return ingest(event, sha256Hex(rawBody));
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Ledger first, then apply. Re-applying a duplicate is harmless and repairs a crash between the two writes. */
export async function ingest(event: BillingEvent, payloadSha256: string): Promise<WebhookResult> {
  const store = billingStore();
  const current = event.subscriptionId ? await store.subscription(event.provider, event.subscriptionId) : undefined;
  const outcome = applyBillingEvent(current, event);
  const label = outcome.result === "applied" ? "applied" : outcome.reason;
  // Record the tenant we actually resolved (the stored owner wins over event metadata).
  const ledgerEvent = { ...event, tenantId: current?.tenantId ?? event.tenantId };
  const { duplicate } = await store.append(entryFor(ledgerEvent, payloadSha256, label));
  if (outcome.result === "applied") await store.saveSubscription(outcome.subscription);
  return { status: 200, body: { received: true, duplicate, outcome: label } };
}

export interface ReconcileReport {
  checked: number;
  corrected: number;
  errors: number;
}

/**
 * Daily control: ask each provider for the live status of every open subscription and
 * correct (and ledger) any drift — a missed or failed webhook can't leave access wrong for long.
 */
export async function reconcileSubscriptions(limit = 200, now = new Date()): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, corrected: 0, errors: 0 };
  const store = billingStore();
  for (const sub of await store.openSubscriptions(limit)) {
    if (sub.status === "incomplete" && sub.updatedAt === new Date(0).toISOString()) {
      // Never paid; the provider expires these itself. Nothing to reconcile yet.
      continue;
    }
    report.checked++;
    try {
      const live = await liveStatus(sub);
      if (!live) continue;
      if (live.status === sub.status && live.cancelAtPeriodEnd === sub.cancelAtPeriodEnd) continue;
      const day = now.toISOString().slice(0, 10);
      const event: BillingEvent = {
        provider: sub.provider,
        eventId: `reconcile:${sub.subscriptionId}:${day}:${live.raw}:${live.cancelAtPeriodEnd ? 1 : 0}`,
        providerType: `reconciliation.${live.raw}`,
        kind: "reconciled",
        tenantId: sub.tenantId,
        subscriptionId: sub.subscriptionId,
        status: live.status,
        cancelAtPeriodEnd: live.cancelAtPeriodEnd,
        occurredAt: now.toISOString(),
      };
      await ingest(event, sha256Hex(JSON.stringify(live)));
      report.corrected++;
    } catch {
      report.errors++;
    }
  }
  return report;
}

async function liveStatus(sub: Subscription) {
  if (sub.provider === "stripe") {
    const cfg = stripeConfig();
    return cfg ? stripeSubscriptionStatus(cfg, sub.subscriptionId) : null;
  }
  const cfg = razorpayConfig();
  return cfg ? razorpaySubscriptionStatus(cfg, sub.subscriptionId) : null;
}

/** For account erasure: cancel a Razorpay subscription that never took a payment (best effort). */
export async function cancelUnpaidSubscriptions(tenantId: string): Promise<void> {
  const cfg = razorpayConfig();
  for (const s of await billingStore().subscriptionsForTenant(tenantId)) {
    if (s.status !== "incomplete" || s.provider !== "razorpay" || !cfg) continue;
    await razorpayCancelNow(cfg, s.subscriptionId).catch(() => undefined);
  }
}
