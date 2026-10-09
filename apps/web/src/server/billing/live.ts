/**
 * What Stripe actually holds for plans and discounts, read live (with a short cache) — for checkout,
 * the candidate's plan cards and billing administration. Nothing here falls back to a stored number:
 * when Stripe can't be read, there is no discount and no "active promotion code".
 */
import { couponApplies, couponFromStripe, discountFor, type Coupon, type PlanDiscount } from "@/domain/billing/discounts";
import type { PaidPlanId, PlansConfig } from "@/domain/billing/plans";
import { stateStore } from "@/server/state";
import { stripeConfig, type StripeConfig } from "./config";
import { getPlansConfig, PLATFORM_TENANT } from "./plansConfig";
import { ProviderError, stripeCall } from "./stripe";

export const PAID_PLANS: PaidPlanId[] = ["pro", "max"];
/**
 * Promotion codes changed shape in later Stripe API versions (`coupon` → `promotion.coupon`); these
 * calls pin a version where `coupon` is a top-level field, whatever the account's default is.
 */
export const PROMO_API_VERSION = "2024-06-20";
const DOC = "wj.billingadmin";
const LIVE_TTL_MS = 60_000;

/* ------------------------------------------------------------------ state */

export interface AutomaticEntry {
  couponId: string;
  setAt: string;
  setBy: string;
}
export interface AdminState {
  automatic?: Partial<Record<PaidPlanId, AutomaticEntry>>;
  /** Completed provider calls by idempotency key: a retry returns the recorded result instead of calling again. */
  ops?: Record<string, { at: string; result: unknown }>;
}

export async function readAdminState(): Promise<AdminState> {
  const doc = await stateStore.get(PLATFORM_TENANT, DOC);
  const s = doc?.state;
  return s && typeof s === "object" && !Array.isArray(s) ? (s as AdminState) : {};
}

export async function writeAdminState(s: AdminState) {
  await stateStore.put(PLATFORM_TENANT, DOC, s);
}

/* ------------------------------------------------------------------ reads */

export interface StripePriceView {
  ref: string;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  active: boolean;
  productId: string;
  productName?: string;
}

const stripePrices = new Map<string, { at: number; price: StripePriceView }>();
const coupons = new Map<string, { at: number; coupon: Coupon | null }>();
let activePromo: { at: number; value: boolean } | null = null;

/** Tests, and after any admin change: forget what was read from Stripe. */
export function clearLiveBillingCaches() {
  stripePrices.clear();
  coupons.clear();
  activePromo = null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** A recurring Stripe price with a fixed amount (422 when it isn't one). */
export async function readStripePrice(cfg: Pick<StripeConfig, "secretKey">, id: string, fresh = false): Promise<StripePriceView> {
  const hit = stripePrices.get(id);
  if (!fresh && hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.price;
  const p = await stripeCall<Obj>(cfg, "GET", `/prices/${encodeURIComponent(id)}?expand[]=product`);
  const recurring = obj(p.recurring);
  const product = p.product;
  const productId = typeof product === "string" ? product : typeof obj(product).id === "string" ? (obj(product).id as string) : undefined;
  if (typeof p.unit_amount !== "number" || typeof p.currency !== "string" || !productId || !recurring.interval) throw new ProviderError("Not a recurring price with a fixed amount", 422);
  const name = obj(product).name;
  const price: StripePriceView = {
    ref: typeof p.id === "string" ? p.id : id,
    amount: p.unit_amount,
    currency: p.currency.toUpperCase(),
    interval: String(recurring.interval),
    intervalCount: Number(recurring.interval_count ?? 1),
    active: p.active !== false,
    productId,
    ...(typeof name === "string" ? { productName: name } : {}),
  };
  stripePrices.set(id, { at: Date.now(), price });
  return price;
}

export async function readCoupon(cfg: Pick<StripeConfig, "secretKey">, id: string): Promise<Coupon | null> {
  const hit = coupons.get(id);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.coupon;
  const coupon = couponFromStripe(await stripeCall<Obj>(cfg, "GET", `/coupons/${encodeURIComponent(id)}?expand[]=applies_to`));
  coupons.set(id, { at: Date.now(), coupon });
  return coupon;
}

/** Whether any promotion code is active at Stripe — checkout shows Stripe's code field only then. Unreadable = no field. */
export async function hasActivePromotionCode(): Promise<boolean> {
  const s = stripeConfig();
  if (!s) return false;
  if (activePromo && Date.now() - activePromo.at < LIVE_TTL_MS) return activePromo.value;
  let value = false;
  try {
    const list = await stripeCall<{ data?: unknown[] }>(s, "GET", "/promotion_codes?active=true&limit=1", undefined, undefined, PROMO_API_VERSION);
    value = Array.isArray(list.data) && list.data.length > 0;
  } catch {
    value = false;
  }
  activePromo = { at: Date.now(), value };
  return value;
}

/**
 * The plan's automatic discount if — read live from Stripe — the coupon is valid and applies to the
 * plan's current Stripe price, with the price a candidate would actually pay. Anything unreadable = none.
 */
export async function automaticDiscount(plan: PaidPlanId, plans?: PlansConfig): Promise<{ couponId: string; discount: PlanDiscount } | null> {
  const s = stripeConfig();
  if (!s) return null;
  try {
    const entry = (await readAdminState()).automatic?.[plan];
    if (!entry) return null;
    const cfg = plans ?? (await getPlansConfig());
    const ref = cfg.priceRefs[plan].stripe;
    if (!ref) return null;
    const [price, coupon] = await Promise.all([readStripePrice(s, ref), readCoupon(s, entry.couponId)]);
    const live = { amount: price.amount, currency: price.currency, productId: price.productId };
    if (!coupon || !couponApplies(coupon, live)) return null;
    const discount = discountFor(coupon, live);
    return discount ? { couponId: entry.couponId, discount } : null;
  } catch (e) {
    console.error(`[billing] automatic discount for ${plan} unreadable: ${e instanceof Error ? e.name : "unknown"}`);
    return null;
  }
}

/** For the candidate's plan cards: each paid plan's live discounted price, when one applies. */
export async function planDiscounts(plans: PlansConfig): Promise<Partial<Record<PaidPlanId, PlanDiscount>>> {
  const out: Partial<Record<PaidPlanId, PlanDiscount>> = {};
  for (const plan of PAID_PLANS) {
    const d = await automaticDiscount(plan, plans);
    if (d) out[plan] = d.discount;
  }
  return out;
}
