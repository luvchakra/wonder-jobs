import type { BillingEvent, SubscriptionStatus } from "./types";

/**
 * Translate verified provider webhooks into `BillingEvent`s. These functions only
 * run AFTER the signature check (server/billing/webhooks.ts); they never trust a
 * payload on their own. Unknown event types become `ignored` events: they are still
 * written to the ledger so the financial record is complete, but change nothing.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const iso = (unixSeconds: unknown): string | undefined => {
  const n = num(unixSeconds);
  return n ? new Date(n * 1000).toISOString() : undefined;
};
/** Stripe expands some references into objects; accept either form. */
const ref = (v: unknown): string | undefined => str(v) ?? str(obj(v).id);

export function normalizeStripeStatus(s: unknown): SubscriptionStatus {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "incomplete";
  }
}

export function normalizeRazorpayStatus(s: unknown): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "paused":
      return "paused";
    case "halted":
      return "unpaid";
    case "cancelled":
    case "completed":
    case "expired":
      return "canceled";
    default:
      // created, authenticated: mandate set up, first charge not confirmed.
      return "incomplete";
  }
}

/** Stripe moved `current_period_end` onto subscription items in 2025 API versions; read either. */
function stripePeriodEnd(sub: Obj): string | undefined {
  const top = iso(sub.current_period_end);
  if (top) return top;
  const items = obj(sub.items).data;
  if (Array.isArray(items)) {
    const ends = items.map((i) => num(obj(i).current_period_end)).filter((n): n is number => n !== undefined);
    if (ends.length) return iso(Math.max(...ends));
  }
  return undefined;
}

function stripePriceRef(sub: Obj): string | undefined {
  const items = obj(sub.items).data;
  if (!Array.isArray(items) || !items.length) return undefined;
  const first = obj(items[0]);
  return ref(first.price) ?? ref(first.plan);
}

/** Stripe also moved `invoice.subscription` under `parent.subscription_details`. */
function stripeInvoiceSubscription(inv: Obj): string | undefined {
  return ref(inv.subscription) ?? ref(obj(obj(inv.parent).subscription_details).subscription);
}

function stripeInvoiceTenant(inv: Obj): string | undefined {
  return str(obj(obj(inv.subscription_details).metadata).tenant_id) ?? str(obj(obj(obj(inv.parent).subscription_details).metadata).tenant_id);
}

export function fromStripeEvent(event: unknown): BillingEvent {
  const e = obj(event);
  const type = str(e.type) ?? "unknown";
  const o = obj(obj(e.data).object);
  const base = { provider: "stripe" as const, eventId: str(e.id) ?? "", providerType: type, occurredAt: iso(e.created) ?? new Date(0).toISOString() };
  switch (type) {
    case "checkout.session.completed": {
      if (o.mode !== "subscription") return { ...base, kind: "ignored" };
      return {
        ...base,
        kind: "checkout_completed",
        tenantId: str(o.client_reference_id) ?? str(obj(o.metadata).tenant_id),
        subscriptionId: ref(o.subscription),
        customerId: ref(o.customer),
        amount: num(o.amount_total),
        currency: str(o.currency)?.toUpperCase(),
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const status = type === "customer.subscription.deleted" ? "canceled" : normalizeStripeStatus(o.status);
      return {
        ...base,
        kind: status === "canceled" ? "subscription_canceled" : "subscription_updated",
        tenantId: str(obj(o.metadata).tenant_id),
        subscriptionId: str(o.id),
        customerId: ref(o.customer),
        planRef: stripePriceRef(o),
        status,
        currentPeriodEnd: stripePeriodEnd(o),
        cancelAtPeriodEnd: o.cancel_at_period_end === true || num(o.cancel_at) !== undefined,
      };
    }
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const failed = type === "invoice.payment_failed";
      return {
        ...base,
        kind: failed ? "payment_failed" : "payment_succeeded",
        tenantId: stripeInvoiceTenant(o),
        subscriptionId: stripeInvoiceSubscription(o),
        customerId: ref(o.customer),
        amount: failed ? num(o.amount_due) : num(o.amount_paid),
        currency: str(o.currency)?.toUpperCase(),
        status: failed ? "past_due" : undefined,
      };
    }
    default:
      return { ...base, kind: "ignored" };
  }
}

/**
 * Razorpay webhooks carry no event id in the body; it arrives in the
 * `x-razorpay-event-id` header, which the caller passes in.
 */
export function fromRazorpayEvent(event: unknown, eventId: string): BillingEvent {
  const e = obj(event);
  const type = str(e.event) ?? "unknown";
  const payload = obj(e.payload);
  const sub = obj(obj(payload.subscription).entity);
  const pay = obj(obj(payload.payment).entity);
  const base = { provider: "razorpay" as const, eventId, providerType: type, occurredAt: iso(e.created_at) ?? new Date(0).toISOString() };
  if (!type.startsWith("subscription.")) return { ...base, kind: "ignored" };
  const status = normalizeRazorpayStatus(sub.status);
  const common = {
    tenantId: str(obj(sub.notes).tenant_id),
    subscriptionId: str(sub.id),
    customerId: str(sub.customer_id),
    planRef: str(sub.plan_id),
    status,
    currentPeriodEnd: iso(sub.current_end),
    // Razorpay reports a scheduled cancellation as `has_scheduled_changes` / `change_scheduled_at` on cancel-at-cycle-end.
    cancelAtPeriodEnd: sub.has_scheduled_changes === true && status === "active" ? true : undefined,
  };
  switch (type) {
    case "subscription.charged":
      return { ...base, kind: "payment_succeeded", ...common, amount: num(pay.amount), currency: str(pay.currency)?.toUpperCase() };
    case "subscription.pending":
      return { ...base, kind: "payment_failed", ...common, amount: num(pay.amount), currency: str(pay.currency)?.toUpperCase() };
    case "subscription.cancelled":
    case "subscription.completed":
      return { ...base, kind: "subscription_canceled", ...common, status: "canceled" };
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.halted":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.updated":
      return { ...base, kind: "subscription_updated", ...common };
    default:
      return { ...base, kind: "ignored", ...common };
  }
}
