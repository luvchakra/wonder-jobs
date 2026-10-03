import { describe, expect, it } from "vitest";
import { fromRazorpayEvent, fromStripeEvent, normalizeRazorpayStatus, normalizeStripeStatus } from "./events";
import { applyBillingEvent, entitlementFor, isBillable } from "./subscription";
import type { BillingEvent, Subscription } from "./types";

const T = 1_790_000_000; // a unix time in 2026

describe("provider event normalisation", () => {
  it("reads a Stripe subscription checkout", () => {
    const e = fromStripeEvent({ id: "evt_1", type: "checkout.session.completed", created: T, data: { object: { mode: "subscription", client_reference_id: "tenant-a", subscription: "sub_1", customer: "cus_1", amount_total: 49900, currency: "inr" } } });
    expect(e).toMatchObject({ kind: "checkout_completed", tenantId: "tenant-a", subscriptionId: "sub_1", customerId: "cus_1", amount: 49900, currency: "INR", eventId: "evt_1" });
  });

  it("ignores a one-off (non-subscription) Stripe checkout", () => {
    expect(fromStripeEvent({ id: "evt_2", type: "checkout.session.completed", created: T, data: { object: { mode: "payment" } } }).kind).toBe("ignored");
  });

  it("reads current_period_end from subscription items (2025+ Stripe API) and from the top level (older)", () => {
    const newer = fromStripeEvent({ id: "e", type: "customer.subscription.updated", created: T, data: { object: { id: "sub_1", status: "active", metadata: { tenant_id: "t" }, items: { data: [{ current_period_end: T + 86400, price: { id: "price_1" } }] } } } });
    expect(newer.currentPeriodEnd).toBe(new Date((T + 86400) * 1000).toISOString());
    expect(newer.planRef).toBe("price_1");
    const older = fromStripeEvent({ id: "e2", type: "customer.subscription.updated", created: T, data: { object: { id: "sub_1", status: "past_due", current_period_end: T + 10 } } });
    expect(older).toMatchObject({ status: "past_due", currentPeriodEnd: new Date((T + 10) * 1000).toISOString() });
  });

  it("reads the invoice's subscription from either API shape", () => {
    const a = fromStripeEvent({ id: "i1", type: "invoice.paid", created: T, data: { object: { subscription: "sub_9", amount_paid: 1200, currency: "usd" } } });
    const b = fromStripeEvent({ id: "i2", type: "invoice.paid", created: T, data: { object: { parent: { subscription_details: { subscription: "sub_9", metadata: { tenant_id: "t9" } } }, amount_paid: 1200, currency: "usd" } } });
    expect(a).toMatchObject({ kind: "payment_succeeded", subscriptionId: "sub_9", amount: 1200, currency: "USD" });
    expect(b).toMatchObject({ kind: "payment_succeeded", subscriptionId: "sub_9", tenantId: "t9" });
  });

  it("treats customer.subscription.deleted as cancelled whatever the status says", () => {
    expect(fromStripeEvent({ id: "d", type: "customer.subscription.deleted", created: T, data: { object: { id: "sub_1", status: "active" } } })).toMatchObject({ kind: "subscription_canceled", status: "canceled" });
  });

  it("reads a Razorpay charge with the event id from the header", () => {
    const e = fromRazorpayEvent(
      { event: "subscription.charged", created_at: T, payload: { subscription: { entity: { id: "sub_R", plan_id: "plan_1", status: "active", current_end: T + 2592000, customer_id: "cust_1", notes: { tenant_id: "t-r" } } }, payment: { entity: { id: "pay_1", amount: 49900, currency: "INR" } } } },
      "evt_hdr",
    );
    expect(e).toMatchObject({ eventId: "evt_hdr", kind: "payment_succeeded", tenantId: "t-r", subscriptionId: "sub_R", planRef: "plan_1", status: "active", amount: 49900, currency: "INR" });
  });

  it("ledgers but ignores non-subscription Razorpay events", () => {
    expect(fromRazorpayEvent({ event: "payment.captured", created_at: T, payload: {} }, "x").kind).toBe("ignored");
  });

  it("maps provider statuses onto one vocabulary", () => {
    expect(["active", "trialing", "past_due", "unpaid", "canceled", "incomplete"].map(normalizeStripeStatus)).toEqual(["active", "active", "past_due", "unpaid", "canceled", "incomplete"]);
    expect(["created", "authenticated", "active", "pending", "halted", "cancelled", "completed"].map(normalizeRazorpayStatus)).toEqual(["incomplete", "incomplete", "active", "past_due", "unpaid", "canceled", "canceled"]);
  });
});

const ev = (over: Partial<BillingEvent>): BillingEvent => ({ provider: "stripe", eventId: "e", providerType: "x", kind: "subscription_updated", subscriptionId: "sub_1", occurredAt: "2026-10-01T00:00:00.000Z", ...over });
const sub = (over: Partial<Subscription> = {}): Subscription => ({ tenantId: "t1", provider: "stripe", subscriptionId: "sub_1", status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-10-01T00:00:00.000Z", ...over });

describe("applying events to a subscription", () => {
  it("creates a record from the first event that names a tenant", () => {
    const r = applyBillingEvent(undefined, ev({ tenantId: "t1", status: "active" }));
    expect(r).toMatchObject({ result: "applied", subscription: { tenantId: "t1", status: "active" } });
  });

  it("refuses an event that would move a subscription to another tenant", () => {
    expect(applyBillingEvent(sub(), ev({ tenantId: "someone-else", status: "active", occurredAt: "2026-10-02T00:00:00.000Z" }))).toEqual({ result: "rejected", reason: "tenant_mismatch" });
  });

  it("does nothing without a tenant to attach to", () => {
    expect(applyBillingEvent(undefined, ev({ status: "active" }))).toEqual({ result: "unchanged", reason: "no_tenant" });
  });

  it("ignores an out-of-order status change older than the one applied", () => {
    expect(applyBillingEvent(sub({ updatedAt: "2026-10-05T00:00:00.000Z" }), ev({ status: "incomplete", occurredAt: "2026-10-01T00:00:00.000Z" }))).toEqual({ result: "unchanged", reason: "stale" });
  });

  it("checkout completion alone doesn't grant access", () => {
    const r = applyBillingEvent(undefined, ev({ kind: "checkout_completed", tenantId: "t1" }));
    expect(r.result === "applied" && entitlementFor(r.subscription).plan).toBe("free");
  });

  it("a paid invoice activates; a failed one moves to past_due; cancellation ends access", () => {
    const paid = applyBillingEvent(sub({ status: "incomplete" }), ev({ kind: "payment_succeeded", occurredAt: "2026-10-02T00:00:00.000Z" }));
    expect(paid.result === "applied" && paid.subscription.status).toBe("active");
    const failed = applyBillingEvent(sub(), ev({ kind: "payment_failed", occurredAt: "2026-10-02T00:00:00.000Z" }));
    expect(failed.result === "applied" && failed.subscription.status).toBe("past_due");
    const ended = applyBillingEvent(sub(), ev({ kind: "subscription_canceled", status: "canceled", occurredAt: "2026-10-02T00:00:00.000Z" }));
    expect(ended.result === "applied" && entitlementFor(ended.subscription).plan).toBe("free");
  });

  it("an old payment can't re-activate a subscription that has since stopped", () => {
    expect(applyBillingEvent(sub({ status: "unpaid", updatedAt: "2026-10-05T00:00:00.000Z" }), ev({ kind: "payment_succeeded", occurredAt: "2026-10-01T00:00:00.000Z" }))).toEqual({ result: "unchanged", reason: "stale" });
  });

  it("a failed payment never grants access", () => {
    for (const status of ["incomplete", "unpaid", "paused"] as const) {
      const r = applyBillingEvent(sub({ status, updatedAt: "2026-09-01T00:00:00.000Z" }), ev({ kind: "payment_failed", occurredAt: "2026-10-02T00:00:00.000Z" }));
      expect(r.result === "applied" && entitlementFor(r.subscription).plan).toBe("free");
    }
  });

  it("re-applying the same event gives the same result (redelivery is harmless)", () => {
    const e = ev({ tenantId: "t1", status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" });
    const once = applyBillingEvent(undefined, e);
    const twice = once.result === "applied" ? applyBillingEvent(once.subscription, e) : once;
    expect(twice).toEqual(once);
  });
});

describe("entitlement", () => {
  it("fails closed to Free with no subscription", () => {
    expect(entitlementFor(undefined)).toEqual({ plan: "free", reason: "No subscription" });
    const sub: Subscription = { tenantId: "t", provider: "stripe", subscriptionId: "sub_1", planRef: "price_max", status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-01-01T00:00:00Z" };
    expect(entitlementFor(sub).plan).toBe("pro");
    expect(entitlementFor(sub, (ref) => (ref === "price_max" ? "max" : "pro"))).toMatchObject({ plan: "max", reason: "Active" });
    expect(entitlementFor({ ...sub, cancelAtPeriodEnd: true }, () => "max").reason).toContain("Max until");
  });
  it("keeps Pro to the end of a cancelled period, and says so", () => {
    const e = entitlementFor(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: "2026-11-01T00:00:00.000Z" }));
    expect(e.plan).toBe("pro");
    expect(e.reason).toContain("Cancelled — Pro until 1 Nov 2026");
  });
  it("past_due keeps access while the provider retries; unpaid and paused don't", () => {
    expect(entitlementFor(sub({ status: "past_due" })).plan).toBe("pro");
    expect(entitlementFor(sub({ status: "unpaid" })).plan).toBe("free");
    expect(entitlementFor(sub({ status: "paused" })).plan).toBe("free");
  });
  it("a subscription still taking money blocks erasure until it's cancelled", () => {
    expect(isBillable(sub())).toBe(true);
    expect(isBillable(sub({ cancelAtPeriodEnd: true }))).toBe(false);
    expect(isBillable(sub({ status: "canceled" }))).toBe(false);
    expect(isBillable(sub({ status: "incomplete" }))).toBe(false);
  });
});
