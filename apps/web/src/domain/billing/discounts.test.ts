import { describe, expect, it } from "vitest";
import { couponFromStripe, discountFor, discountTerm, type Coupon } from "./discounts";
import { diffPlans, PromoInput } from "./admin";
import { DEFAULT_PLANS, mergePlansConfig, planForRef } from "./plans";

const PRICE = { amount: 49_900, currency: "INR", productId: "prod_pro" };
const coupon = (over: Partial<Coupon> = {}): Coupon => ({ id: "co", valid: true, percentOff: 20, amountOff: null, currency: null, duration: "once", durationInMonths: null, products: ["prod_pro"], redeemBy: null, timesRedeemed: 0, maxRedemptions: null, ...over });

describe("discountFor", () => {
  it("computes the price Stripe would charge with a valid coupon for this product", () => {
    expect(discountFor(coupon(), PRICE)).toEqual({ regularMinor: 49_900, amountMinor: 39_920, currency: "INR", duration: "once", durationInMonths: null });
    expect(discountFor(coupon({ percentOff: null, amountOff: 10_000, currency: "INR", duration: "forever" }), PRICE)?.amountMinor).toBe(39_900);
    expect(discountFor(coupon({ products: null }), PRICE)?.amountMinor).toBe(39_920);
  });
  it("shows no discount unless it really applies", () => {
    expect(discountFor(coupon({ valid: false }), PRICE)).toBeNull();
    expect(discountFor(coupon({ products: ["prod_max"] }), PRICE)).toBeNull();
    expect(discountFor(coupon({ percentOff: null, amountOff: 1000, currency: "USD" }), PRICE)).toBeNull();
    expect(discountFor(coupon({ percentOff: null, amountOff: null }), PRICE)).toBeNull();
    expect(discountFor(null, PRICE)).toBeNull();
  });
  it("reads Stripe's coupon object", () => {
    const c = couponFromStripe({ id: "co_1", valid: true, percent_off: 15, duration: "repeating", duration_in_months: 3, applies_to: { products: ["prod_pro"] }, redeem_by: 1_800_000_000, times_redeemed: 2, max_redemptions: 10 });
    expect(c).toMatchObject({ id: "co_1", percentOff: 15, duration: "repeating", durationInMonths: 3, products: ["prod_pro"], timesRedeemed: 2, maxRedemptions: 10 });
    expect(discountTerm(c!)).toBe("first 3 months");
    expect(couponFromStripe({ id: "x" })).toBeNull();
  });
});

describe("admin inputs and diffs", () => {
  const base = { discount: { kind: "percent", percentOff: 10 }, duration: "once", plans: ["pro"], requestId: "req-abcdefgh" };
  it("upper-cases a promo code and enforces its format", () => {
    expect(PromoInput.parse({ ...base, code: " launch_20 " }).code).toBe("LAUNCH_20");
    expect(PromoInput.safeParse({ ...base, code: "has space" }).success).toBe(false);
    expect(PromoInput.safeParse({ ...base, code: "X".repeat(41) }).success).toBe(false);
  });
  it("lists exactly the fields that changed", () => {
    const before = mergePlansConfig(DEFAULT_PLANS);
    const after = mergePlansConfig({ ...DEFAULT_PLANS, plans: { ...DEFAULT_PLANS.plans, max: { ...DEFAULT_PLANS.plans.max, keepWatch: false, label: "Ultra" } } });
    expect(diffPlans(before, after)).toEqual([
      { field: "max.label", from: "Max", to: "Ultra" },
      { field: "max.keepWatch", from: true, to: false },
    ]);
  });
  it("keeps a plan's previous price ids, so their subscribers keep the plan", () => {
    const cfg = mergePlansConfig({ priceRefs: { max: { stripe: "price_max_new", previous: ["price_max_old", "price_max_old"] } } });
    expect(cfg.priceRefs.max.previous).toEqual(["price_max_old"]);
    expect(planForRef("price_max_old", cfg)).toBe("max");
  });
});
