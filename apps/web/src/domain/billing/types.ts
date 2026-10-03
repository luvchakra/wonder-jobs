import type { PlanId } from "./plans";
/**
 * Billing domain: provider-neutral types for subscriptions paid through
 * Stripe or Razorpay. Pure — no I/O. The server adapters translate each
 * provider's webhook payloads into `BillingEvent`s and the rest of the app
 * only ever sees these shapes.
 */
export type BillingProviderId = "stripe" | "razorpay";

export const BILLING_PROVIDERS: Record<BillingProviderId, { name: string; methods: string }> = {
  stripe: { name: "Stripe", methods: "Cards, Apple Pay and Google Pay" },
  razorpay: { name: "Razorpay", methods: "UPI, cards, net banking and wallets (India)" },
};

/**
 * Normalised subscription status. Stripe and Razorpay each have their own vocabularies;
 * `normalizeStripeStatus` / `normalizeRazorpayStatus` map onto this one.
 */
export type SubscriptionStatus =
  /** Created at the provider, first payment not confirmed yet. */
  | "incomplete"
  | "active"
  /** A renewal failed and the provider is retrying. Access continues while it retries. */
  | "past_due"
  | "paused"
  /** Retries exhausted or the mandate was halted. No access. */
  | "unpaid"
  /** Ended: cancelled immediately, completed, or expired. No access. */
  | "canceled";

export interface Subscription {
  tenantId: string;
  provider: BillingProviderId;
  /** The provider's subscription id (sub_… / sub_…). */
  subscriptionId: string;
  customerId?: string;
  /** The provider's price (Stripe) or plan (Razorpay) id this subscription is on. */
  planRef?: string;
  status: SubscriptionStatus;
  /** ISO time the current paid period ends, when the provider says. */
  currentPeriodEnd?: string;
  /** Cancellation requested; access continues until `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  /** Provider event id that last changed this record (for tracing and reconciliation). */
  lastEventId?: string;
}

export type BillingEventKind =
  | "checkout_completed"
  | "subscription_updated"
  | "subscription_canceled"
  | "payment_succeeded"
  | "payment_failed"
  /** Recorded by the daily reconciliation when the provider and our record disagree. */
  | "reconciled"
  /** Anything we receive but don't act on is still ledgered, so the record is complete. */
  | "ignored";

/** One provider notification, normalised. Every one is written to the append-only ledger. */
export interface BillingEvent {
  provider: BillingProviderId;
  /** Provider's event id — the idempotency key. A redelivered webhook carries the same id. */
  eventId: string;
  /** The provider's own event type string, kept verbatim for the auditor. */
  providerType: string;
  kind: BillingEventKind;
  tenantId?: string;
  subscriptionId?: string;
  customerId?: string;
  planRef?: string;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** Money moved, in the currency's minor unit (paise, cents), when the event is a payment. */
  amount?: number;
  currency?: string;
  /** When the provider says it happened (ISO). */
  occurredAt: string;
}

/** A price as the provider reports it. Never hardcoded: read from Stripe / Razorpay at request time. */
export interface PlanPrice {
  provider: BillingProviderId;
  /** Price / plan id at the provider. */
  ref: string;
  name: string;
  description?: string;
  /** Minor units. */
  amount: number;
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
}

export type ProviderAvailability =
  | { provider: BillingProviderId; state: "ready"; price: PlanPrice }
  | { provider: BillingProviderId; state: "needs_setup"; missing: string[] }
  | { provider: BillingProviderId; state: "unavailable"; reason: string };

export interface Entitlement {
  plan: PlanId;
  /** Why: shown to the candidate so the plan badge has provenance. */
  reason: string;
  /** Until when Pro is paid for, when known. */
  until?: string;
  subscription?: Subscription;
}
