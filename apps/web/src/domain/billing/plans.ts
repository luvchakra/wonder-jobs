import { z } from "zod";

/**
 * Plans: what each tier allows, as data the operator can change at any time (server/billing/plansConfig.ts
 * keeps the stored copy; this file holds the defaults and the rules that read them). Nothing is deleted
 * when a plan lapses — limits apply to new use.
 */
export const PLAN_IDS = ["free", "pro", "max"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, "free">;
export const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, max: 2 };
export const planAtLeast = (plan: PlanId, min: PlanId) => PLAN_RANK[plan] >= PLAN_RANK[min];

export interface PlanLimits {
  label: string;
  tagline: string;
  /** Monthly price in the currency's minor unit (paise); 0 for Free. Shown to candidates; the payment provider charges what its price says. */
  priceMinor: number;
  currency: string;
  /** Scheduled searches that may be switched on at once. */
  scheduledSearches: number;
  /** Whether a scheduled search may run every day (else weekly). */
  dailySearches: boolean;
  /** Whether "Keep watch" (continuous) is allowed. */
  keepWatch: boolean;
  /** Drafts written by WonderJobs AI per calendar month; a connected own-AI key never counts. */
  aiDraftsPerMonth: number;
  /** Roles the candidate can search as. */
  roles: number;
  /** How many résumé designs, counted from the first in the gallery; 8 is all of them. */
  resumeTemplates: number;
  atsReport: boolean;
  applyWithWonder: boolean;
}

export interface PriceRefs {
  stripe?: string;
  razorpay?: string;
  /** Ids this plan was sold under before a price change: existing subscribers keep paying them, and must keep the plan. */
  previous?: string[];
}

export interface PlansConfig {
  plans: Record<PlanId, PlanLimits>;
  /** The payment provider's price (Stripe) / plan (Razorpay) ids that map a paid subscription to a plan. */
  priceRefs: Record<PaidPlanId, PriceRefs>;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PLANS: PlansConfig = {
  plans: {
    free: { label: "Free", tagline: "Looking casually", priceMinor: 0, currency: "INR", scheduledSearches: 1, dailySearches: false, keepWatch: false, aiDraftsPerMonth: 5, roles: 1, resumeTemplates: 2, atsReport: false, applyWithWonder: false },
    pro: { label: "Pro", tagline: "Actively applying", priceMinor: 49_900, currency: "INR", scheduledSearches: 3, dailySearches: true, keepWatch: false, aiDraftsPerMonth: 60, roles: 3, resumeTemplates: 8, atsReport: false, applyWithWonder: true },
    max: { label: "Max", tagline: "Senior, or several roles at once", priceMinor: 129_900, currency: "INR", scheduledSearches: 10, dailySearches: true, keepWatch: true, aiDraftsPerMonth: 300, roles: 6, resumeTemplates: 8, atsReport: true, applyWithWonder: true },
  },
  priceRefs: { pro: {}, max: {} },
};

export const LimitsSchema = z
  .object({
    label: z.string().trim().min(1).max(30),
    tagline: z.string().trim().max(80),
    priceMinor: z.number().int().min(0).max(100_000_000),
    currency: z.string().trim().length(3).toUpperCase(),
    scheduledSearches: z.number().int().min(0).max(1000),
    dailySearches: z.boolean(),
    keepWatch: z.boolean(),
    aiDraftsPerMonth: z.number().int().min(0).max(1_000_000),
    roles: z.number().int().min(1).max(50),
    resumeTemplates: z.number().int().min(0).max(100),
    atsReport: z.boolean(),
    applyWithWonder: z.boolean(),
  })
  .partial();
const RefsSchema = z.object({ stripe: z.string().trim().max(200).optional(), razorpay: z.string().trim().max(200).optional(), previous: z.array(z.string().trim().min(1).max(200)).max(200).optional() }).partial();
const ConfigSchema = z
  .object({
    plans: z.object({ free: LimitsSchema, pro: LimitsSchema, max: LimitsSchema }).partial(),
    priceRefs: z.object({ pro: RefsSchema, max: RefsSchema }).partial(),
    updatedAt: z.string().optional(),
    updatedBy: z.string().optional(),
  })
  .partial();

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A stored config over the defaults: every field the stored copy lacks or gets wrong keeps its default — field by field, so one bad value never discards the rest. */
export function mergePlansConfig(stored: unknown): PlansConfig {
  const s = isRecord(stored) ? stored : {};
  const storedPlans = isRecord(s.plans) ? s.plans : {};
  const plans = Object.fromEntries(
    PLAN_IDS.map((id) => {
      const raw = isRecord(storedPlans[id]) ? storedPlans[id] : {};
      const out: PlanLimits = { ...DEFAULT_PLANS.plans[id] };
      for (const key of Object.keys(LimitsSchema.shape) as (keyof PlanLimits)[]) {
        const r = LimitsSchema.shape[key].safeParse(raw[key]);
        if (r.success && r.data !== undefined) (out as unknown as Record<string, unknown>)[key] = r.data;
      }
      return [id, out];
    }),
  ) as Record<PlanId, PlanLimits>;
  const storedRefs = isRecord(s.priceRefs) ? s.priceRefs : {};
  const clean = (v: unknown): PriceRefs => {
    const r = RefsSchema.safeParse(isRecord(v) ? v : {});
    const d = r.success ? r.data : {};
    return { ...(d.stripe ? { stripe: d.stripe } : {}), ...(d.razorpay ? { razorpay: d.razorpay } : {}), ...(d.previous?.length ? { previous: [...new Set(d.previous)] } : {}) };
  };
  const meta = ConfigSchema.pick({ updatedAt: true, updatedBy: true }).safeParse(s);
  return { plans, priceRefs: { pro: clean(storedRefs.pro), max: clean(storedRefs.max) }, ...(meta.success && meta.data.updatedAt ? { updatedAt: meta.data.updatedAt } : {}), ...(meta.success && meta.data.updatedBy ? { updatedBy: meta.data.updatedBy } : {}) };
}

/**
 * Which paid plan a subscription's price/plan id buys. An id nobody mapped is Pro: the first paid tier, never
 * the top one. A price the plan was sold under before a price change still buys it — subscribers keep their price.
 */
export function planForRef(ref: string | undefined, cfg: PlansConfig): PaidPlanId {
  const max = cfg.priceRefs.max;
  if (ref && (ref === max.stripe || ref === max.razorpay || max.previous?.includes(ref))) return "max";
  return "pro";
}

export const limitsFor = (plan: PlanId, cfg: PlansConfig): PlanLimits => cfg.plans[plan];

/** "2026-10": the calendar month a draft counts against. */
export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function draftQuota(limit: number, used: number): { allowed: boolean; remaining: number; limit: number } {
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
}

export type ScheduleCadence = "daily" | "weekly" | "keep_watch" | "manual";

function scheduleProblem(l: PlanLimits, enabledOthers: number, cadence: ScheduleCadence): string | null {
  if (cadence === "manual") return null;
  if (cadence === "keep_watch" && !l.keepWatch) return "Keep watch";
  if (cadence === "daily" && !l.dailySearches) return "a daily search";
  if (enabledOthers + 1 > l.scheduledSearches) return `more than ${l.scheduledSearches} scheduled search${l.scheduledSearches === 1 ? "" : "es"} at once`;
  return null;
}

/** May this schedule be switched on? `needs` is the lowest plan that allows it (null when none does). */
export function scheduleAllowance(plan: PlanId, cfg: PlansConfig, enabledOthers: number, cadence: ScheduleCadence): { ok: true } | { ok: false; reason: string; needs: PlanId | null } {
  const problem = scheduleProblem(cfg.plans[plan], enabledOthers, cadence);
  if (!problem) return { ok: true };
  const needs = PLAN_IDS.filter((p) => PLAN_RANK[p] > PLAN_RANK[plan]).find((p) => !scheduleProblem(cfg.plans[p], enabledOthers, cadence)) ?? null;
  return { ok: false, reason: `${cfg.plans[plan].label} doesn't include ${problem}.`, needs };
}

/** The lowest plan that allows a yes/no feature, for the "this needs …" line. */
export function planThatAllows(cfg: PlansConfig, pick: (l: PlanLimits) => boolean): PlanId | null {
  return PLAN_IDS.find((p) => pick(cfg.plans[p])) ?? null;
}
