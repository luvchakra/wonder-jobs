/**
 * Billing administration (Platform → Billing): plans and features, the prices the payment providers
 * charge, promotion codes and automatic discounts, and JobsLake API pricing.
 *
 * Rules every function here keeps:
 * - What candidates are charged is read from Stripe / Razorpay, never from a stored display number. A
 *   price change creates a NEW provider price and then points the plan (and its displayed price) at it,
 *   so the two can't drift; subscribers on the old price keep it, and keep their plan (`previous` refs).
 * - Every call that creates something at a provider has an idempotency key (Stripe's header, and this
 *   module's own ledger of completed calls for Razorpay, which has no such header) and an audit entry
 *   written BEFORE the call — if the audit can't be written, the call isn't made.
 * - Provider error text can quote a key, so it is logged server-side only; admins see a fixed description.
 * - Discounts are Stripe's: promotion codes (entered on Stripe's hosted checkout) and at most one
 *   automatic coupon per plan. Razorpay offers are managed in the Razorpay dashboard and aren't shown here.
 */
import type { z } from "zod";
import { diffPlans, AutomaticDiscountInput, ApiPlanInput, PaidPlan, PlanFeaturesInput, PriceChangeInput, PriceOverrideInput, PromoDeactivateInput, PromoInput } from "@/domain/billing/admin";
import { couponFromStripe, type Coupon, type PlanDiscount } from "@/domain/billing/discounts";
import { formatMoney } from "@/domain/billing/format";
import { PLAN_IDS, type PaidPlanId, type PlansConfig } from "@/domain/billing/plans";
import { apiPlanConfig } from "@/domain/jobslake/apiPlan";
import { jobsLakeStore } from "@/server/jobslake/store";
import { listSources } from "@/server/jobslake/registry";
import { apiSourceIds } from "@/server/jobslake/developer";
import { loadApiPlan, saveApiPlan } from "@/server/jobslake/apiPlanSettings";
import { apiBillingConfig, apiPrice, type ApiPrice } from "@/server/jobslake/apiBilling";
import { razorpayConfig, stripeConfig, type RazorpayConfig, type StripeConfig } from "./config";
import { getPlansConfig, getStoredPlansConfig, savePlansConfig } from "./plansConfig";
import { automaticDiscount, clearLiveBillingCaches, PAID_PLANS, PROMO_API_VERSION, readAdminState, readCoupon, readStripePrice, writeAdminState, type StripePriceView } from "./live";
import { razorpayCall } from "./razorpay";
import { ProviderError, stripeCall } from "./stripe";
import { sha256Hex } from "../crypto";

/** Audit rows for billing administration live in the platform audit trail under this namespace. */
export const BILLING_AUDIT = "billing";
export class AdminBillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = status === 400 ? "INVALID_REQUEST" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : status === 503 ? "NEEDS_SETUP" : "UNAVAILABLE",
  ) {
    super(message);
    this.name = "AdminBillingError";
  }
}

/** Validate or refuse with the first problem, in words. */
function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  throw new AdminBillingError(issue ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Invalid request", 400);
}

/** A fixed description of a provider failure — never the provider's own text. */
function providerFailure(e: unknown, name: "Stripe" | "Razorpay"): AdminBillingError {
  if (e instanceof AdminBillingError) return e;
  const status = e instanceof ProviderError ? e.status : 0;
  if (!(e instanceof ProviderError)) console.error(`[billing-admin] ${name} call failed: ${e instanceof Error ? e.name : "unknown"}`);
  if (status === 401 || status === 403) return new AdminBillingError(`${name} rejected this deployment's credentials`, 502);
  if (status === 404) return new AdminBillingError(`${name} doesn't have that object`, 502);
  if (status === 400 || status === 402) return new AdminBillingError(`${name} refused the request — check the values (a promotion code must be new)`, 502);
  if (status === 429) return new AdminBillingError(`${name} is rate-limiting requests; try again shortly`, 502);
  return new AdminBillingError(`${name} couldn't be reached`, 502);
}

/* ------------------------------------------------------------- ledger, audit */

/** Run a provider call at most once per key. */
async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = (await readAdminState()).ops?.[key];
  if (hit) return hit.result as T;
  const result = await fn();
  const fresh = await readAdminState();
  const ops = Object.entries({ ...(fresh.ops ?? {}), [key]: { at: new Date().toISOString(), result } })
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, 500);
  await writeAdminState({ ...fresh, ops: Object.fromEntries(ops) });
  return result;
}

export async function billingAudit(actor: string, action: string, detail: Record<string, unknown>): Promise<void> {
  await jobsLakeStore().appendAudit({ at: new Date().toISOString(), actor, action, sourceId: BILLING_AUDIT, detail });
}

/** The audit row a provider call needs before it may run: no row, no call. */
async function auditBefore(actor: string, action: string, detail: Record<string, unknown>) {
  try {
    await billingAudit(actor, action, detail);
  } catch (e) {
    console.error(`[billing-admin] audit write failed before ${action}: ${e instanceof Error ? e.message : "unknown"}`);
    throw new AdminBillingError("The change couldn't be written to the audit trail, so it wasn't made. Try again shortly.", 503);
  }
}

/** After the call: recorded if at all possible, logged if not (the provider already acted). */
async function auditAfter(actor: string, action: string, detail: Record<string, unknown>) {
  await billingAudit(actor, action, detail).catch((e) => console.error(`[billing-admin] audit write failed after ${action}: ${e instanceof Error ? e.message : "unknown"}`));
}

export async function billingHistory(limit = 200) {
  return jobsLakeStore().listAudit(limit, BILLING_AUDIT);
}

/* ------------------------------------------------------- reading provider prices */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

export interface RazorpayPlanView {
  ref: string;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
}
const RZP_PERIOD: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

async function readRazorpayPlan(cfg: RazorpayConfig, id: string): Promise<RazorpayPlanView> {
  const p = await razorpayCall<{ id: string; period: string; interval: number; item: { amount: number; currency: string } }>(cfg, "GET", `/plans/${encodeURIComponent(id)}`);
  if (typeof p.item?.amount !== "number" || !p.item.currency) throw new ProviderError("Not a plan with a fixed amount", 422);
  return { ref: p.id, amount: p.item.amount, currency: p.item.currency.toUpperCase(), interval: RZP_PERIOD[p.period] ?? p.period, intervalCount: p.interval };
}

const unavailableReason = (e: unknown, name: "Stripe" | "Razorpay") => (e instanceof ProviderError && e.status === 422 ? `${e.message} at ${name}` : providerFailure(e, name).message);

export type ProviderPrice =
  | { state: "needs_setup" }
  | { state: "not_set" }
  | ({ state: "ready" } & (StripePriceView | RazorpayPlanView))
  | { state: "unavailable"; ref: string; reason: string };

export interface PlanPrices {
  plan: PaidPlanId;
  label: string;
  /** What candidates are shown. */
  display: { priceMinor: number; currency: string };
  stripe: ProviderPrice;
  razorpay: ProviderPrice;
  /** Every provider that charges for this plan charges exactly the displayed price. */
  inSync: boolean;
}

/** Per paid plan: what each provider will actually charge, read live. */
export async function adminPrices(): Promise<{ plans: PlanPrices[]; providers: { stripe: boolean; razorpay: boolean } }> {
  const cfg = await getPlansConfig();
  const s = stripeConfig();
  const r = razorpayConfig();
  const plans = await Promise.all(
    PAID_PLANS.map(async (plan): Promise<PlanPrices> => {
      const refs = cfg.priceRefs[plan];
      const stripe: ProviderPrice = !s ? { state: "needs_setup" } : !refs.stripe ? { state: "not_set" } : await readStripePrice(s, refs.stripe, true).then((p) => ({ state: "ready" as const, ...p }), (e) => ({ state: "unavailable" as const, ref: refs.stripe!, reason: unavailableReason(e, "Stripe") }));
      const razorpay: ProviderPrice = !r ? { state: "needs_setup" } : !refs.razorpay ? { state: "not_set" } : await readRazorpayPlan(r, refs.razorpay).then((p) => ({ state: "ready" as const, ...p }), (e) => ({ state: "unavailable" as const, ref: refs.razorpay!, reason: unavailableReason(e, "Razorpay") }));
      const display = { priceMinor: cfg.plans[plan].priceMinor, currency: cfg.plans[plan].currency };
      const charging = [stripe, razorpay].filter((p) => p.state !== "needs_setup" && p.state !== "not_set");
      const inSync = charging.length > 0 && charging.every((p) => p.state === "ready" && p.amount === display.priceMinor && p.currency === display.currency);
      return { plan, label: cfg.plans[plan].label, display, stripe, razorpay, inSync };
    }),
  );
  return { plans, providers: { stripe: !!s, razorpay: !!r } };
}

/* ------------------------------------------------------------- plans & features */

/** Where each limit is enforced — so an admin knows which ones the server re-checks. */
export const ENFORCED_AT: Record<string, string> = {
  scheduledSearches: "Server: scheduled runs (server/workflow/scheduledRun.ts) run at most this many.",
  dailySearches: "Browser: the schedule screens (scheduleAllowance); the server doesn't re-check it yet.",
  keepWatch: "Browser: the schedule screens (scheduleAllowance); the server doesn't re-check it yet.",
  aiDraftsPerMonth: "Server: /api/ai/complete counts each WonderJobs AI draft.",
  roles: "Browser: the Roles card; the server doesn't re-check it yet.",
  resumeTemplates: "Browser: the Résumé studio gallery.",
  atsReport: "Server: /api/resume-files/[id]/ats.",
  applyWithWonder: "Server: /api/jobs-apply/sessions.",
  highlights: "Nowhere — shown on pricing (landing page, Account) exactly as written. Keep each line true for the plan.",
};

export async function savePlanFeatures(raw: unknown, actor: string): Promise<{ config: PlansConfig; changes: ReturnType<typeof diffPlans> }> {
  const input = parse(PlanFeaturesInput, raw);
  const before = await getStoredPlansConfig().catch(() => {
    throw new AdminBillingError("The stored plans couldn't be read, so nothing was changed. Try again shortly.", 503);
  });
  const next: PlansConfig = { ...before, plans: { ...before.plans } };
  for (const id of PLAN_IDS) {
    const patch = input.plans[id];
    if (patch) next.plans[id] = { ...before.plans[id], ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  }
  const changes = diffPlans(before, next);
  if (!changes.length) return { config: await getPlansConfig(), changes };
  await savePlansConfig(next, actor);
  await auditAfter(actor, "billing.plans.saved", { changes });
  return { config: await getPlansConfig(), changes };
}

/* ------------------------------------------------------------------ prices */

async function createStripePrice(cfg: StripeConfig, plans: PlansConfig, plan: PaidPlanId, amountMinor: number, currency: string, key: string): Promise<string> {
  const current = plans.priceRefs[plan].stripe;
  let product: string;
  if (current) product = (await readStripePrice(cfg, current, true)).productId;
  else product = await once(`${key}:stripe-product`, async () => (await stripeCall<{ id: string }>(cfg, "POST", "/products", { name: `WonderJobs ${plans.plans[plan].label}`, metadata: { wonderjobs_plan: plan } }, `${key}:product`)).id);
  const p = await stripeCall<{ id: string }>(
    cfg,
    "POST",
    "/prices",
    { product, unit_amount: amountMinor, currency: currency.toLowerCase(), recurring: { interval: "month", interval_count: 1 }, nickname: `${plans.plans[plan].label} ${formatMoney(amountMinor, currency, "en-US")}/month`, metadata: { wonderjobs_plan: plan } },
    key,
  );
  if (!p.id) throw new ProviderError("Stripe returned no price id", 502);
  return p.id;
}

async function createRazorpayPlan(cfg: RazorpayConfig, plans: PlansConfig, plan: PaidPlanId, amountMinor: number, currency: string, key: string): Promise<string> {
  const p = await razorpayCall<{ id: string }>(cfg, "POST", "/plans", {
    period: "monthly",
    interval: 1,
    item: { name: plans.plans[plan].label, amount: amountMinor, currency, description: plans.plans[plan].tagline || undefined },
    notes: { wonderjobs_plan: plan, idempotency_key: key.slice(0, 250) },
  });
  if (!p.id) throw new ProviderError("Razorpay returned no plan id", 502);
  return p.id;
}

function withRef(cfg: PlansConfig, plan: PaidPlanId, provider: "stripe" | "razorpay", ref: string, oldRef: string | undefined): PlansConfig {
  const refs = cfg.priceRefs[plan];
  const previous = [...new Set([...(refs.previous ?? []), ...(oldRef && oldRef !== ref ? [oldRef] : [])])].filter((r) => r !== ref);
  return { ...cfg, priceRefs: { ...cfg.priceRefs, [plan]: { ...refs, [provider]: ref, ...(previous.length ? { previous } : {}) } } };
}

/**
 * Change what a paid plan costs: a new monthly price at every connected provider (Stripe on the
 * plan's current product), then the plan points at them and shows that amount. All or nothing — if
 * one provider refuses, the plan keeps its current prices (a retry with the same requestId reuses
 * whatever was already created).
 */
export async function changePrice(raw: unknown, actor: string): Promise<{ plan: PaidPlanId; created: { stripe?: string; razorpay?: string }; config: PlansConfig }> {
  const input = parse(PriceChangeInput, raw);
  const s = stripeConfig();
  const r = razorpayConfig();
  if (!s && !r) throw new AdminBillingError("No payment provider is connected on this deployment, so there's no price to change.", 503);
  const cfg = await getPlansConfig();
  const key = `price:${input.plan}:${input.amountMinor}:${input.currency}:${input.requestId}`;
  await auditBefore(actor, "billing.price.change_requested", { plan: input.plan, amountMinor: input.amountMinor, currency: input.currency, idempotencyKey: key });
  const created: { stripe?: string; razorpay?: string } = {};
  let current: "Stripe" | "Razorpay" = "Stripe";
  try {
    if (s) created.stripe = await once(`${key}:stripe`, () => createStripePrice(s, cfg, input.plan, input.amountMinor, input.currency, key));
    current = "Razorpay";
    if (r) created.razorpay = await once(`${key}:razorpay`, () => createRazorpayPlan(r, cfg, input.plan, input.amountMinor, input.currency, key));
  } catch (e) {
    await auditAfter(actor, "billing.price.change_failed", { plan: input.plan, idempotencyKey: key, created, provider: current });
    throw providerFailure(e, current);
  }
  const stored = await getStoredPlansConfig();
  let next: PlansConfig = { ...stored, plans: { ...stored.plans, [input.plan]: { ...stored.plans[input.plan], priceMinor: input.amountMinor, currency: input.currency } } };
  for (const provider of ["stripe", "razorpay"] as const) {
    const ref = created[provider];
    if (ref) next = withRef(next, input.plan, provider, ref, cfg.priceRefs[input.plan][provider]);
  }
  await savePlansConfig(next, actor);
  clearLiveBillingCaches();
  await auditAfter(actor, "billing.price.changed", {
    plan: input.plan,
    idempotencyKey: key,
    from: { priceMinor: cfg.plans[input.plan].priceMinor, currency: cfg.plans[input.plan].currency, stripe: cfg.priceRefs[input.plan].stripe ?? null, razorpay: cfg.priceRefs[input.plan].razorpay ?? null },
    to: { priceMinor: input.amountMinor, currency: input.currency, stripe: created.stripe ?? cfg.priceRefs[input.plan].stripe ?? null, razorpay: created.razorpay ?? cfg.priceRefs[input.plan].razorpay ?? null },
  });
  return { plan: input.plan, created, config: await getPlansConfig() };
}

/**
 * Point a plan at an existing provider price/plan id. Its amount is read from the provider and becomes the
 * displayed price; it must match what the other connected provider charges for the plan, or it's refused.
 */
export async function overridePriceRef(raw: unknown, actor: string): Promise<{ config: PlansConfig }> {
  const input = parse(PriceOverrideInput, raw);
  const s = stripeConfig();
  const r = razorpayConfig();
  const name = input.provider === "stripe" ? "Stripe" : "Razorpay";
  if (input.provider === "stripe" ? !s : !r) throw new AdminBillingError(`${name} isn't connected on this deployment.`, 503);
  let live: { amount: number; currency: string; interval: string; intervalCount: number };
  try {
    if (input.provider === "stripe") {
      const p = await readStripePrice(s!, input.ref, true);
      if (!p.active) throw new AdminBillingError("That Stripe price is archived — candidates couldn't buy it.", 400);
      live = p;
    } else live = await readRazorpayPlan(r!, input.ref);
  } catch (e) {
    if (e instanceof ProviderError && e.status === 422) throw new AdminBillingError(`${e.message} at ${name}.`, 400);
    throw providerFailure(e, name);
  }
  if (live.interval !== "month" || live.intervalCount !== 1) throw new AdminBillingError(`Plans are sold monthly; that ${name} price bills every ${live.intervalCount} ${live.interval}.`, 400);
  const cfg = await getPlansConfig();
  const other = input.provider === "stripe" ? "razorpay" : "stripe";
  const otherRef = cfg.priceRefs[input.plan][other];
  if ((other === "stripe" ? s : r) && otherRef) {
    const otherName = other === "stripe" ? "Stripe" : "Razorpay";
    const o = await (other === "stripe" ? readStripePrice(s!, otherRef, true) : readRazorpayPlan(r!, otherRef)).catch(() => null);
    if (!o) throw new AdminBillingError(`${otherName}'s price for this plan couldn't be read, so a match can't be confirmed. Use Change price to set both.`, 409);
    if (o.amount !== live.amount || o.currency !== live.currency) throw new AdminBillingError(`${otherName} charges ${formatMoney(o.amount, o.currency)} for this plan and that ${name} price is ${formatMoney(live.amount, live.currency)}. Use Change price to set both.`, 409);
  }
  const stored = await getStoredPlansConfig();
  let next: PlansConfig = { ...stored, plans: { ...stored.plans, [input.plan]: { ...stored.plans[input.plan], priceMinor: live.amount, currency: live.currency } } };
  next = withRef(next, input.plan, input.provider, input.ref, cfg.priceRefs[input.plan][input.provider]);
  await savePlansConfig(next, actor);
  clearLiveBillingCaches();
  await auditAfter(actor, "billing.price.ref_set", { plan: input.plan, provider: input.provider, from: cfg.priceRefs[input.plan][input.provider] ?? null, to: input.ref, priceMinor: live.amount, currency: live.currency });
  return { config: await getPlansConfig() };
}

/* ------------------------------------------------------- discounts: shared */

/** Each paid plan's Stripe product, for `applies_to` — read from the plan's current price. */
async function planProduct(cfg: StripeConfig, plans: PlansConfig, plan: PaidPlanId): Promise<StripePriceView> {
  const ref = plans.priceRefs[plan].stripe;
  if (!ref) throw new AdminBillingError(`${plans.plans[plan].label} isn't sold through Stripe yet — set its price first.`, 409);
  try {
    return await readStripePrice(cfg, ref);
  } catch (e) {
    throw providerFailure(e, "Stripe");
  }
}

type DiscountFields = Pick<PromoInput, "discount" | "duration" | "durationInMonths">;

function couponBody(input: DiscountFields, products: string[], name: string, extra: Obj): Obj {
  return {
    ...(input.discount.kind === "percent" ? { percent_off: input.discount.percentOff } : { amount_off: input.discount.amountOffMinor, currency: input.discount.currency.toLowerCase() }),
    duration: input.duration,
    ...(input.duration === "repeating" ? { duration_in_months: input.durationInMonths } : {}),
    applies_to: { products: Object.fromEntries(products.map((p, i) => [i, p])) },
    name: name.slice(0, 40),
    ...extra,
  };
}

/** An amount off only works in the currency the plan is charged in. */
function checkCurrency(input: DiscountFields, prices: StripePriceView[], plans: PlansConfig, ids: PaidPlanId[]) {
  if (input.discount.kind !== "amount") return;
  const cur = input.discount.currency;
  prices.forEach((p, i) => {
    if (p.currency !== cur) throw new AdminBillingError(`${plans.plans[ids[i]].label} is charged in ${p.currency}; an amount off must be in ${p.currency} too.`, 400);
  });
}

/**
 * The submitted values, hashed into the idempotency key: an admin who edits the form after a failure and
 * resubmits gets a new key (Stripe refuses a reused key with different parameters), a plain retry the same one.
 */
const paramsHash = (input: Record<string, unknown>) => sha256Hex(JSON.stringify({ ...input, requestId: undefined })).slice(0, 12);

const unix = (iso?: string) => (iso ? Math.floor(Date.parse(iso) / 1000) : undefined);

/* ------------------------------------------------------------ promotion codes */

export interface PromoView {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  coupon: Coupon | null;
  /** The plans it applies to (null = every Stripe product). */
  plans: PaidPlanId[] | null;
}

function promoFromStripe(raw: unknown, productPlan: Map<string, PaidPlanId>): PromoView | null {
  const p = obj(raw);
  if (typeof p.id !== "string" || typeof p.code !== "string") return null;
  const coupon = couponFromStripe(p.coupon ?? obj(p.promotion).coupon);
  return {
    id: p.id,
    code: p.code,
    active: p.active === true,
    timesRedeemed: typeof p.times_redeemed === "number" ? p.times_redeemed : 0,
    maxRedemptions: typeof p.max_redemptions === "number" ? p.max_redemptions : null,
    expiresAt: typeof p.expires_at === "number" ? new Date(p.expires_at * 1000).toISOString() : null,
    coupon,
    plans: coupon?.products ? [...new Set(coupon.products.flatMap((id) => productPlan.get(id) ?? []))] : null,
  };
}

async function productPlans(cfg: StripeConfig, plans: PlansConfig): Promise<Map<string, PaidPlanId>> {
  const out = new Map<string, PaidPlanId>();
  for (const plan of PAID_PLANS) {
    const ref = plans.priceRefs[plan].stripe;
    if (!ref) continue;
    const p = await readStripePrice(cfg, ref).catch(() => null);
    if (p) out.set(p.productId, plan);
  }
  return out;
}

export type StripeState = "ready" | "needs_setup";

export interface AutomaticView {
  plan: PaidPlanId;
  couponId: string;
  setAt: string;
  setBy: string;
  coupon: Coupon | null;
  /** Applied at checkout right now, and shown on the plan card. */
  discount: PlanDiscount | null;
  problem?: string;
}

/** Promotion codes as Stripe has them (real redemption counts), and the automatic discount per plan. */
export async function adminDiscounts(): Promise<{ stripe: StripeState; promos: PromoView[] | null; promosError?: string; automatic: AutomaticView[] }> {
  const s = stripeConfig();
  if (!s) return { stripe: "needs_setup", promos: null, automatic: [] };
  const cfg = await getPlansConfig();
  const map = await productPlans(s, cfg);
  let promos: PromoView[] | null = null;
  let promosError: string | undefined;
  try {
    const list = await stripeCall<{ data?: unknown[] }>(s, "GET", "/promotion_codes?limit=100&expand[]=data.coupon.applies_to", undefined, undefined, PROMO_API_VERSION);
    promos = (list.data ?? []).flatMap((p) => promoFromStripe(p, map) ?? []);
  } catch (e) {
    promosError = providerFailure(e, "Stripe").message;
  }
  const state = await readAdminState();
  const automatic: AutomaticView[] = [];
  for (const plan of PAID_PLANS) {
    const a = state.automatic?.[plan];
    if (!a) continue;
    const coupon = await readCoupon(s, a.couponId).catch(() => undefined);
    const live = await automaticDiscount(plan, cfg);
    automatic.push({ plan, ...a, coupon: coupon ?? null, discount: live?.discount ?? null, ...(coupon === undefined ? { problem: "Unavailable — Stripe couldn't be read" } : !live ? { problem: coupon?.valid === false ? "Expired or used up — not applied" : "Doesn't apply to this plan's current price — not applied" } : {}) });
  }
  return { stripe: "ready", promos, ...(promosError ? { promosError } : {}), automatic };
}

export async function createPromo(raw: unknown, actor: string): Promise<PromoView> {
  const input = parse(PromoInput, raw);
  const s = stripeConfig();
  if (!s) throw new AdminBillingError("Stripe isn't connected on this deployment.", 503);
  const cfg = await getPlansConfig();
  const prices = await Promise.all(input.plans.map((p) => planProduct(s, cfg, p)));
  checkCurrency(input, prices, cfg, input.plans);
  const products = [...new Set(prices.map((p) => p.productId))];
  const key = `promo:${input.code}:${paramsHash(input)}:${input.requestId}`;
  await auditBefore(actor, "billing.promo.create_requested", { code: input.code, discount: input.discount, duration: input.duration, durationInMonths: input.durationInMonths ?? null, plans: input.plans, maxRedemptions: input.maxRedemptions ?? null, expiresAt: input.expiresAt ?? null, idempotencyKey: key });
  let couponId: string | undefined;
  try {
    couponId = await once(`${key}:coupon`, async () => (await stripeCall<{ id: string }>(s, "POST", "/coupons", couponBody(input, products, input.code, { metadata: { wonderjobs: "promo_code" } }), `${key}:coupon`, PROMO_API_VERSION)).id);
    const promo = await once(`${key}:promotion_code`, async () =>
      stripeCall<Obj>(s, "POST", "/promotion_codes", { coupon: couponId, code: input.code, max_redemptions: input.maxRedemptions, expires_at: unix(input.expiresAt), metadata: { wonderjobs: "promo_code" } }, `${key}:promotion_code`, PROMO_API_VERSION),
    );
    clearLiveBillingCaches();
    await auditAfter(actor, "billing.promo.created", { code: input.code, couponId, promotionCodeId: promo.id ?? null, idempotencyKey: key });
    const view = promoFromStripe({ ...promo, coupon: promo.coupon && typeof promo.coupon === "object" ? promo.coupon : undefined }, await productPlans(s, cfg));
    if (!view) throw new ProviderError("Stripe returned no promotion code", 502);
    return view;
  } catch (e) {
    await auditAfter(actor, "billing.promo.create_failed", { code: input.code, couponId: couponId ?? null, idempotencyKey: key });
    throw providerFailure(e, "Stripe");
  }
}

/** Stripe promotion codes can't be deleted: deactivating stops new redemptions; past ones stand. */
export async function deactivatePromo(raw: unknown, actor: string): Promise<{ id: string; active: false }> {
  const input = parse(PromoDeactivateInput, raw);
  const s = stripeConfig();
  if (!s) throw new AdminBillingError("Stripe isn't connected on this deployment.", 503);
  await auditBefore(actor, "billing.promo.deactivate_requested", { promotionCodeId: input.id });
  try {
    await stripeCall(s, "POST", `/promotion_codes/${encodeURIComponent(input.id)}`, { active: false }, `promo-off:${input.id}`, PROMO_API_VERSION);
  } catch (e) {
    await auditAfter(actor, "billing.promo.deactivate_failed", { promotionCodeId: input.id });
    throw providerFailure(e, "Stripe");
  }
  clearLiveBillingCaches();
  await auditAfter(actor, "billing.promo.deactivated", { promotionCodeId: input.id });
  return { id: input.id, active: false };
}

/* ---------------------------------------------------------- automatic discount */

export async function setAutomaticDiscount(raw: unknown, actor: string): Promise<AutomaticView[]> {
  const input = parse(AutomaticDiscountInput, raw);
  const s = stripeConfig();
  if (!s) throw new AdminBillingError("Stripe isn't connected on this deployment.", 503);
  const cfg = await getPlansConfig();
  const price = await planProduct(s, cfg, input.plan);
  checkCurrency(input, [price], cfg, [input.plan]);
  const key = `auto:${input.plan}:${paramsHash(input)}:${input.requestId}`;
  await auditBefore(actor, "billing.discount.set_requested", { plan: input.plan, discount: input.discount, duration: input.duration, durationInMonths: input.durationInMonths ?? null, expiresAt: input.expiresAt ?? null, idempotencyKey: key });
  let couponId: string;
  try {
    couponId = await once(`${key}:coupon`, async () => (await stripeCall<{ id: string }>(s, "POST", "/coupons", couponBody(input, [price.productId], `${cfg.plans[input.plan].label} offer`, { redeem_by: unix(input.expiresAt), metadata: { wonderjobs: "automatic", wonderjobs_plan: input.plan } }), `${key}:coupon`)).id);
  } catch (e) {
    await auditAfter(actor, "billing.discount.set_failed", { plan: input.plan, idempotencyKey: key });
    throw providerFailure(e, "Stripe");
  }
  const state = await readAdminState();
  const previous = state.automatic?.[input.plan]?.couponId ?? null;
  await writeAdminState({ ...state, automatic: { ...state.automatic, [input.plan]: { couponId, setAt: new Date().toISOString(), setBy: actor } } });
  clearLiveBillingCaches();
  await auditAfter(actor, "billing.discount.set", { plan: input.plan, couponId, replaced: previous, idempotencyKey: key });
  return (await adminDiscounts()).automatic;
}

/** Stop applying a plan's automatic discount to new checkouts. Subscribers who already have it keep it for its duration. */
export async function clearAutomaticDiscount(raw: unknown, actor: string): Promise<{ plan: PaidPlanId }> {
  const plan = parse(PaidPlan, obj(raw).plan);
  const state = await readAdminState();
  const entry = state.automatic?.[plan];
  if (!entry) return { plan };
  const automatic = { ...state.automatic };
  delete automatic[plan];
  await writeAdminState({ ...state, automatic });
  clearLiveBillingCaches();
  await auditAfter(actor, "billing.discount.cleared", { plan, couponId: entry.couponId });
  return { plan };
}

/* ------------------------------------------------------------ JobsLake API */

export interface ApiPlanAdmin {
  effective: { freeMonthly: number; maxMonthly: number; sourceIds: string[] };
  stored: { updatedAt?: string; updatedBy?: string } | null;
  sources: { id: string; name: string; category: string; accessStrategy: string; status: string }[];
  price: { state: "ready"; price: ApiPrice; dashboardUrl: string } | { state: "needs_setup" } | { state: "unavailable"; reason: string };
}

export async function adminApiPlan(): Promise<ApiPlanAdmin> {
  const stored = await loadApiPlan(true);
  const plan = apiPlanConfig(process.env, stored);
  const sources = (await listSources()).filter((s) => s.status !== "do_not_use").map((s) => ({ id: s.id, name: s.name, category: s.category, accessStrategy: s.accessStrategy, status: s.status }));
  const cfg = apiBillingConfig();
  let price: ApiPlanAdmin["price"] = { state: "needs_setup" };
  if (cfg) {
    try {
      price = { state: "ready", price: await apiPrice(cfg), dashboardUrl: `https://dashboard.stripe.com/${cfg.secretKey.startsWith("sk_test") || cfg.secretKey.startsWith("rk_test") ? "test/" : ""}prices/${encodeURIComponent(cfg.priceId)}` };
    } catch (e) {
      price = { state: "unavailable", reason: unavailableReason(e, "Stripe") };
    }
  }
  return { effective: { ...plan, sourceIds: apiSourceIds(process.env, stored) }, stored: stored?.updatedAt ? { updatedAt: stored.updatedAt, updatedBy: stored.updatedBy } : null, sources, price };
}

export async function saveApiPlanAdmin(raw: unknown, actor: string): Promise<ApiPlanAdmin> {
  const input = parse(ApiPlanInput, raw);
  const known = new Set((await listSources()).filter((s) => s.status !== "do_not_use").map((s) => s.id));
  const unknown = input.sourceIds.filter((id) => !known.has(id));
  if (unknown.length) throw new AdminBillingError(`Not a registered source: ${unknown.join(", ")}`, 400);
  const before = await adminApiPlan();
  await saveApiPlan({ freeMonthly: input.freeMonthly, maxMonthly: input.maxMonthly, sourceIds: [...new Set(input.sourceIds)] }, actor);
  const after = await adminApiPlan();
  const changes = (["freeMonthly", "maxMonthly"] as const).filter((k) => before.effective[k] !== after.effective[k]).map((k) => ({ field: k, from: before.effective[k], to: after.effective[k] }));
  const added = after.effective.sourceIds.filter((s) => !before.effective.sourceIds.includes(s));
  const removed = before.effective.sourceIds.filter((s) => !after.effective.sourceIds.includes(s));
  await auditAfter(actor, "billing.api_plan.saved", { changes, sourcesAdded: added, sourcesRemoved: removed });
  return after;
}
