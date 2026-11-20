import type { PaidPlanId } from "./plans";
import type { Subscription } from "./types";

/**
 * A paid month (owner, 2026-11-06: Razorpay Standard Checkout with orders). Used for Razorpay when the account has no
 * Subscriptions product (its Plans and Subscriptions APIs answer 401) or a plan has no Razorpay plan yet: the candidate
 * pays one month at a time through an order, and nothing renews by itself.
 *
 * Stored like a subscription, so every gate reads it the same way: the order id is the subscription id, the plan
 * reference is `order:<plan>`, and it carries the date the month ends; `cancelAtPeriodEnd` is always set (nothing renews).
 */
export const PREPAID_PREFIX = "order:";

export const prepaidRef = (plan: PaidPlanId) => `${PREPAID_PREFIX}${plan}`;

export function prepaidPlan(ref: string | undefined): PaidPlanId | undefined {
  if (!ref?.startsWith(PREPAID_PREFIX)) return undefined;
  const p = ref.slice(PREPAID_PREFIX.length);
  return p === "pro" || p === "max" ? p : undefined;
}

export const isPrepaid = (sub: Pick<Subscription, "planRef"> | undefined) => !!prepaidPlan(sub?.planRef);

/** One calendar month after `iso` (31 Jan → 28/29 Feb), in UTC. */
export function addMonth(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next.toISOString();
}

/**
 * When a new paid month starts: right away, or (paying again for the same plan before it ends) when the current one
 * ends, so a renewal never loses days.
 */
export function prepaidStart(plan: PaidPlanId, subs: Subscription[], now = new Date()): string {
  const ends = subs
    .filter((s) => s.status === "active" && prepaidPlan(s.planRef) === plan && s.currentPeriodEnd && s.currentPeriodEnd > now.toISOString())
    .map((s) => s.currentPeriodEnd!)
    .sort();
  return ends.at(-1) ?? now.toISOString();
}
