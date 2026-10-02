import type { BillingEvent, Entitlement, Subscription } from "./types";

/**
 * Applying a verified billing event to the stored subscription. Deterministic
 * and pure: the webhook route, the reconciliation job and the tests all use it.
 *
 * Rules:
 * - The tenant on an existing record is authoritative. An event whose metadata
 *   names a different tenant is refused (`tenant_mismatch`) rather than moving a
 *   paid subscription between accounts.
 * - Provider events can arrive out of order. Any event older than the one already
 *   applied is ignored (`stale`) — including payments, so a retried or resent old
 *   invoice can't re-activate a subscription that has since stopped. The caller still
 *   ledgers every event.
 * - A failed payment only ever moves `active` → `past_due`; it never grants access.
 * - Nothing here grants access by itself; `entitlementFor` reads the result.
 */
export type ApplyOutcome =
  | { result: "applied"; subscription: Subscription }
  | { result: "unchanged"; reason: "ignored" | "stale" | "no_subscription" | "no_tenant" }
  | { result: "rejected"; reason: "tenant_mismatch" };

export function applyBillingEvent(current: Subscription | undefined, e: BillingEvent): ApplyOutcome {
  if (e.kind === "ignored") return { result: "unchanged", reason: "ignored" };
  if (!e.subscriptionId) return { result: "unchanged", reason: "no_subscription" };
  if (current && e.tenantId && e.tenantId !== current.tenantId) return { result: "rejected", reason: "tenant_mismatch" };
  const tenantId = current?.tenantId ?? e.tenantId;
  if (!tenantId) return { result: "unchanged", reason: "no_tenant" };
  if (current && current.updatedAt > e.occurredAt) return { result: "unchanged", reason: "stale" };

  const base: Subscription = current ?? {
    tenantId,
    provider: e.provider,
    subscriptionId: e.subscriptionId,
    status: "incomplete",
    cancelAtPeriodEnd: false,
    updatedAt: e.occurredAt,
  };
  const next: Subscription = {
    ...base,
    customerId: e.customerId ?? base.customerId,
    planRef: e.planRef ?? base.planRef,
    currentPeriodEnd: e.currentPeriodEnd ?? base.currentPeriodEnd,
    cancelAtPeriodEnd: e.cancelAtPeriodEnd ?? base.cancelAtPeriodEnd,
    updatedAt: e.occurredAt > base.updatedAt ? e.occurredAt : base.updatedAt,
    lastEventId: e.eventId,
  };
  switch (e.kind) {
    case "checkout_completed":
      // Checkout finishing is not proof of a settled payment; the subscription / invoice events set the status.
      break;
    case "payment_succeeded":
      if (next.status !== "canceled") next.status = "active";
      break;
    case "payment_failed":
      if (next.status === "active") next.status = "past_due";
      break;
    case "subscription_canceled":
      next.status = "canceled";
      next.cancelAtPeriodEnd = false;
      break;
    case "subscription_updated":
    case "reconciled":
      if (e.status) next.status = e.status;
      break;
  }
  return { result: "applied", subscription: next };
}

const fmt = (isoDate: string) => new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** What the candidate is entitled to, and why, from the stored subscription. Fails closed to Free. */
export function entitlementFor(sub: Subscription | undefined): Entitlement {
  if (!sub) return { plan: "free", reason: "No subscription" };
  const until = sub.currentPeriodEnd;
  switch (sub.status) {
    case "active":
      if (sub.cancelAtPeriodEnd) return { plan: "pro", reason: until ? `Cancelled — Pro until ${fmt(until)}` : "Cancelled — Pro until the end of this period", until, subscription: sub };
      return { plan: "pro", reason: until ? `Renews ${fmt(until)}` : "Active", until, subscription: sub };
    case "past_due":
      return { plan: "pro", reason: "Last payment failed — the payment provider is retrying", until, subscription: sub };
    case "incomplete":
      return { plan: "free", reason: "Waiting for the payment provider to confirm your payment", subscription: sub };
    case "paused":
      return { plan: "free", reason: "Subscription paused", subscription: sub };
    case "unpaid":
      return { plan: "free", reason: "Payments failed and the subscription stopped", subscription: sub };
    case "canceled":
      return { plan: "free", reason: "Subscription ended", subscription: sub };
  }
}

/** A subscription that still takes (or may take) money: account erasure waits until it's cancelled. */
export function isBillable(sub: Subscription | undefined): boolean {
  return !!sub && (sub.status === "active" || sub.status === "past_due" || sub.status === "paused") && !sub.cancelAtPeriodEnd;
}
