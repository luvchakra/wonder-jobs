import { applyBillingEvent, entitlementFor } from "@/domain/billing/subscription";
import { limitsFor, PLAN_RANK, planForRef, type PaidPlanId, type PlanId, type PlanLimits, type PlansConfig } from "@/domain/billing/plans";
import { readTestPlan, getPlansConfig } from "./plansConfig";
import { authConfigured } from "@/lib/auth/config";
import { fromRazorpayEvent, fromStripeEvent } from "@/domain/billing/events";
import type { BillingEvent, BillingProviderId, Entitlement, PlanPrice, ProviderAvailability, Subscription } from "@/domain/billing/types";
import { sha256Hex } from "../crypto";
import { recordServerAudit } from "../audit";
import { isErased } from "../privacy/records";
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

/**
 * Testing plans (pre-launch): an account can switch itself to Free, Pro or Max without paying, to see
 * each plan's limits. Allowed while no payment provider is connected on this deployment, and always for
 * platform admins (`JOBSLAKE_ADMIN_EMAILS`). Once payments are live, only an admin's switch still counts.
 */
export function paymentsLive(): boolean {
  return !!(stripeConfig() || razorpayConfig());
}

export async function entitlement(tenantId: string): Promise<Entitlement> {
  // Local development and tests (no Supabase Auth): there are no accounts to bill, so nothing is held back.
  if (!authConfigured()) return { plan: "max", reason: "Local mode — every feature is on" };
  try {
    const config = await getPlansConfig();
    const paid = entitlementFor(currentSubscription(await billingStore().subscriptionsForTenant(tenantId)), (ref) => planForRef(ref, config));
    const test = await readTestPlan(tenantId).catch(() => undefined);
    // A real subscription always wins; a testing plan only fills in where nothing is paid for.
    if (test && paid.plan === "free" && !paid.subscription && (test.byAdmin || !paymentsLive())) return { plan: test.plan, reason: `Testing ${config.plans[test.plan]?.label ?? test.plan} — no payment` };
    return paid;
  } catch {
    // Fail closed: if the record can't be read, nothing paid is unlocked, and we say why.
    return { plan: "free", reason: "Your plan couldn't be checked just now" };
  }
}

/** Server-side gate for any feature that Pro unlocks. Never trust a plan sent by the browser. */
export async function hasPro(tenantId: string): Promise<boolean> {
  return PLAN_RANK[(await entitlement(tenantId)).plan] >= PLAN_RANK.pro;
}

/** The tenant's plan and what it allows — the one place every gate reads from. */
export async function tenantPlan(tenantId: string): Promise<{ plan: PlanId; limits: PlanLimits; config: PlansConfig; entitlement: Entitlement }> {
  const [config, ent] = await Promise.all([getPlansConfig(), entitlement(tenantId)]);
  return { plan: ent.plan, limits: limitsFor(ent.plan, config), config, entitlement: ent };
}

export async function startCheckout(input: { tenantId: string; email?: string; provider: BillingProviderId; origin: string; plan?: PaidPlanId }): Promise<{ url: string }> {
  const { tenantId, provider, origin } = input;
  const plan: PaidPlanId = input.plan ?? "pro";
  const missing = missingBillingEnv(provider);
  if (missing.length) throw new BillingError("This payment provider isn't set up on this deployment yet", 503);
  const config = await getPlansConfig();
  const ref = config.priceRefs[plan][provider];
  if (!ref) throw new BillingError(`${config.plans[plan].label} isn't set up with this payment provider yet`, 503);
  const subs = await billingStore().subscriptionsForTenant(tenantId);
  const current = entitlementFor(currentSubscription(subs), (r) => planForRef(r, config)).plan;
  if (PLAN_RANK[current] >= PLAN_RANK[plan]) throw new BillingError(`You already have ${config.plans[current].label}`, 409);
  if (current !== "free") throw new BillingError(`Cancel ${config.plans[current].label} first, then choose ${config.plans[plan].label} — changing plans mid-subscription isn't automated yet`, 409);
  const back = (state: string) => `${origin}/app/profile?billing=${state}&provider=${provider}#plan`;
  try {
    if (provider === "stripe") {
      // Same key for repeated clicks within a minute, so a double-click opens one checkout, not two.
      const idempotencyKey = `checkout:${tenantId}:${plan}:${Math.floor(Date.now() / 60_000)}`;
      const s = await stripeCheckout({ ...stripeConfig()!, priceId: ref }, { tenantId, email: input.email, successUrl: back("success"), cancelUrl: back("cancelled"), idempotencyKey });
      return { url: s.url };
    }
    const cfg = { ...razorpayConfig()!, planId: ref };
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
  // Razorpay accepted it; reflect that now (ledgered as WonderJobs' own event) rather than waiting for a
  // notice Razorpay may not send for a scheduled cancellation. The daily reconciliation re-checks it.
  const at = new Date().toISOString();
  await ingest(
    { provider: "razorpay", eventId: `wonderjobs:cancel:${sub.subscriptionId}:${at}`, providerType: "wonderjobs.cancel_requested", kind: "subscription_updated", tenantId, subscriptionId: sub.subscriptionId, cancelAtPeriodEnd: sub.status !== "incomplete", status: sub.status === "incomplete" ? "canceled" : undefined, occurredAt: at },
    sha256Hex(`cancel:${sub.subscriptionId}:${at}`),
  );
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
    // Razorpay's `x-razorpay-event-id` header is NOT covered by its signature, so it can't be the
    // idempotency key: a captured body replayed under a fresh header id would count as new. The signed
    // body's hash is the key instead — a genuine redelivery carries the identical body.
    event = fromRazorpayEvent(safeJson(rawBody), `body:${sha256Hex(rawBody)}`);
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
  // An erased account must not be re-created by a late notice (e.g. the end-of-period cancellation):
  // the event is still ledgered — it is a financial record — but nothing is saved against the account.
  const erased = !current && !!event.tenantId && (await isErased(event.tenantId));
  const outcome = erased ? ({ result: "unchanged", reason: "erased_account" } as const) : applyBillingEvent(current, event);
  const label = outcome.result === "applied" ? "applied" : outcome.reason;
  // Record the tenant we actually resolved (the stored owner wins over event metadata).
  const ledgerEvent = { ...event, tenantId: current?.tenantId ?? event.tenantId };
  const { duplicate } = await store.append(entryFor(ledgerEvent, payloadSha256, label));
  // A duplicate is re-applied only to repair a crash between the ledger write and the save; once the
  // stored record already reflects this event, it changes nothing.
  if (outcome.result === "applied" && !(duplicate && current?.lastEventId === event.eventId)) await store.saveSubscription(outcome.subscription);
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
export async function reconcileSubscriptions(limit = 2000, now = new Date(), budgetMs = 60_000): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, corrected: 0, errors: 0 };
  const store = billingStore();
  const started = Date.now();
  // Every open subscription, page by page — including Razorpay ones still awaiting their first
  // confirmation, since a missed activation notice is exactly what this has to catch.
  const open: Subscription[] = [];
  for (let offset = 0; open.length < limit; offset += 200) {
    const page = await store.openSubscriptions(200, offset);
    open.push(...page);
    if (page.length < 200) break;
  }
  for (const sub of open.slice(0, limit)) {
    if (Date.now() - started > budgetMs) break;
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
