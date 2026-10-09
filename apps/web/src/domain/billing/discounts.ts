/**
 * Discounts as Stripe holds them. Pure: the server reads the coupon and the price from Stripe and asks
 * these what a candidate would actually be charged — nothing here invents an amount.
 */

export type CouponDuration = "once" | "repeating" | "forever";

export interface Coupon {
  id: string;
  /** Stripe's own verdict: false once it expired (redeem_by) or ran out of redemptions. */
  valid: boolean;
  percentOff: number | null;
  /** Minor units, with `currency`. */
  amountOff: number | null;
  currency: string | null;
  duration: CouponDuration;
  durationInMonths: number | null;
  /** Products it's limited to; null = every product. */
  products: string[] | null;
  redeemBy: string | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isoFromUnix = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null);

/** A Stripe coupon object (with `applies_to` expanded, when it has one) → a Coupon. Null when it isn't one. */
export function couponFromStripe(raw: unknown): Coupon | null {
  const c = obj(raw);
  if (typeof c.id !== "string" || !c.id) return null;
  const duration = c.duration === "once" || c.duration === "repeating" || c.duration === "forever" ? c.duration : null;
  if (!duration) return null;
  const products = obj(c.applies_to).products;
  return {
    id: c.id,
    valid: c.valid === true,
    percentOff: numOrNull(c.percent_off),
    amountOff: numOrNull(c.amount_off),
    currency: typeof c.currency === "string" && c.currency ? c.currency.toUpperCase() : null,
    duration,
    durationInMonths: numOrNull(c.duration_in_months),
    products: Array.isArray(products) ? products.filter((p): p is string => typeof p === "string") : null,
    redeemBy: isoFromUnix(c.redeem_by),
    timesRedeemed: numOrNull(c.times_redeemed) ?? 0,
    maxRedemptions: numOrNull(c.max_redemptions),
  };
}

export interface LivePrice {
  /** Minor units, as Stripe charges it. */
  amount: number;
  currency: string;
  productId: string;
}

export interface PlanDiscount {
  regularMinor: number;
  amountMinor: number;
  currency: string;
  duration: CouponDuration;
  durationInMonths: number | null;
}

/** Whether a coupon would reduce this price at checkout: valid, limited to nothing or to this price's product, and (for an amount off) in its currency. */
export function couponApplies(c: Coupon, p: LivePrice): boolean {
  if (!c.valid) return false;
  if (c.products && !c.products.includes(p.productId)) return false;
  if (c.percentOff != null) return c.percentOff > 0 && c.percentOff <= 100;
  if (c.amountOff != null) return c.amountOff > 0 && !!c.currency && c.currency === p.currency.toUpperCase();
  return false;
}

/** The price a candidate pays with the coupon applied — only when it applies; null otherwise (show the regular price). */
export function discountFor(c: Coupon | null | undefined, p: LivePrice): PlanDiscount | null {
  if (!c || !couponApplies(c, p)) return null;
  const off = c.percentOff != null ? Math.round((p.amount * c.percentOff) / 100) : (c.amountOff ?? 0);
  const amountMinor = Math.max(0, p.amount - off);
  if (amountMinor >= p.amount) return null;
  return { regularMinor: p.amount, amountMinor, currency: p.currency.toUpperCase(), duration: c.duration, durationInMonths: c.durationInMonths };
}

/** "first payment", "first 3 months", or "" for a discount that lasts. */
export function discountTerm(d: Pick<PlanDiscount, "duration" | "durationInMonths">): string {
  if (d.duration === "once") return "first payment";
  if (d.duration === "repeating" && d.durationInMonths) return `first ${d.durationInMonths} month${d.durationInMonths === 1 ? "" : "s"}`;
  return "";
}

/** How an admin reads a coupon: "20% off", "₹100.00 off", plus how long. */
export function describeCoupon(c: Pick<Coupon, "percentOff" | "amountOff" | "currency" | "duration" | "durationInMonths">, money: (minor: number, currency: string) => string): string {
  const what = c.percentOff != null ? `${c.percentOff}% off` : c.amountOff != null && c.currency ? `${money(c.amountOff, c.currency)} off` : "Discount";
  const term = c.duration === "forever" ? "forever" : c.duration === "once" ? "first payment" : `${c.durationInMonths ?? "?"} months`;
  return `${what} · ${term}`;
}
