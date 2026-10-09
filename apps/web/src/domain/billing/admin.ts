import { z } from "zod";
import { LimitsSchema, PLAN_IDS, type PlanLimits, type PlansConfig } from "./plans";

/**
 * What a billing admin may send, validated before anything reaches Stripe or Razorpay, and the
 * field-by-field diff every plan change is audited with.
 */

/** One submission of an admin form: retries of the same submit reuse it, so they never create twice. */
export const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "requestId must be 8–64 letters, digits, _ or -");
export const PaidPlan = z.enum(["pro", "max"]);
const Currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code")
  .transform((c) => c.toUpperCase());
const Minor = z.number().int("Amounts are whole minor units (paise, cents)").positive("Amounts must be above zero").max(100_000_000);

/** Change a paid plan's price: a new recurring price at every connected provider. */
export const PriceChangeInput = z.object({ plan: PaidPlan, amountMinor: Minor, currency: Currency, requestId: RequestId }).strict();
export type PriceChangeInput = z.infer<typeof PriceChangeInput>;

/** Point a plan at an existing price/plan id instead (the price is read from the provider, never typed in). */
export const PriceOverrideInput = z
  .object({
    plan: PaidPlan,
    provider: z.enum(["stripe", "razorpay"]),
    ref: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]{3,200}$/, "That doesn't look like a price or plan id"),
  })
  .strict();
export type PriceOverrideInput = z.infer<typeof PriceOverrideInput>;

const DiscountFields = {
  discount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("percent"), percentOff: z.number().int("Whole percent").min(1).max(100) }).strict(),
    z.object({ kind: z.literal("amount"), amountOffMinor: Minor, currency: Currency }).strict(),
  ]),
  duration: z.enum(["once", "repeating", "forever"]),
  durationInMonths: z.number().int().min(1).max(36).optional(),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .refine((v) => !v || Date.parse(v) > Date.now(), "The expiry must be in the future"),
  requestId: RequestId,
};
const needsMonths = (v: { duration: string; durationInMonths?: number }) => v.duration !== "repeating" || !!v.durationInMonths;

export const PromoInput = z
  .object({
    code: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9_-]{3,40}$/, "Codes are 3–40 letters, digits, _ or -")),
    plans: z.array(PaidPlan).min(1, "Pick at least one plan").max(2),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
    ...DiscountFields,
  })
  .strict()
  .refine(needsMonths, { message: "Say for how many months", path: ["durationInMonths"] });
export type PromoInput = z.infer<typeof PromoInput>;

export const AutomaticDiscountInput = z
  .object({ plan: PaidPlan, ...DiscountFields })
  .strict()
  .refine(needsMonths, { message: "Say for how many months", path: ["durationInMonths"] });
export type AutomaticDiscountInput = z.infer<typeof AutomaticDiscountInput>;

export const PromoDeactivateInput = z.object({ id: z.string().regex(/^promo_[A-Za-z0-9]{3,100}$/), active: z.literal(false) }).strict();

/** JobsLake API pricing, stored on the platform; unset fields fall back to the environment, then the defaults. */
export const ApiPlanInput = z
  .object({
    freeMonthly: z.number().int().min(0).max(10_000_000),
    maxMonthly: z.number().int().min(0).max(100_000_000),
    sourceIds: z.array(z.string().regex(/^[\w.-]{1,80}$/)).min(1, "Pick at least one source").max(200),
  })
  .strict()
  .refine((v) => v.maxMonthly >= v.freeMonthly, { message: "The safety cap can't be below the free allowance", path: ["maxMonthly"] });
export type ApiPlanInput = z.infer<typeof ApiPlanInput>;

/** The fields the Plans & features page changes — never prices, currencies or provider ids (those live on Prices). */
export const FEATURE_KEYS = ["label", "tagline", "scheduledSearches", "dailySearches", "keepWatch", "aiDraftsPerMonth", "roles", "resumeTemplates", "atsReport", "applyWithWonder"] as const satisfies readonly (keyof PlanLimits)[];

const Features = LimitsSchema.pick({ label: true, tagline: true, scheduledSearches: true, dailySearches: true, keepWatch: true, aiDraftsPerMonth: true, roles: true, resumeTemplates: true, atsReport: true, applyWithWonder: true });
/** Plans & features: per plan, only the feature fields (anything else sent is dropped). */
export const PlanFeaturesInput = z.object({ plans: z.object({ free: Features, pro: Features, max: Features }).partial() });
export type PlanFeaturesInput = z.infer<typeof PlanFeaturesInput>;

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** Every plan field that differs, as "pro.roles: 3 → 4". */
export function diffPlans(before: PlansConfig, after: PlansConfig): FieldChange[] {
  const out: FieldChange[] = [];
  for (const id of PLAN_IDS) {
    for (const key of Object.keys(after.plans[id]) as (keyof PlanLimits)[]) {
      if (before.plans[id][key] !== after.plans[id][key]) out.push({ field: `${id}.${key}`, from: before.plans[id][key], to: after.plans[id][key] });
    }
  }
  for (const id of ["pro", "max"] as const) {
    for (const p of ["stripe", "razorpay"] as const) {
      if (before.priceRefs[id][p] !== after.priceRefs[id][p]) out.push({ field: `${id}.${p}PriceId`, from: before.priceRefs[id][p] ?? null, to: after.priceRefs[id][p] ?? null });
    }
  }
  return out;
}
