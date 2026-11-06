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

/** The plan's name for a badge ("Free plan", "Pro", "Max"): its own label from the plans in force, never a guess from "is it Pro". */
export function planBadgeLabel(plan: PlanId, plans?: Partial<Record<PlanId, { label: string }>>): string {
  const label = plans?.[plan]?.label ?? DEFAULT_PLANS.plans[plan].label;
  return plan === "free" ? `${label} plan` : label;
}

export interface PlanLimits {
  label: string;
  tagline: string;
  /** Monthly price in the currency's minor unit (paise); 0 for Free. Shown to candidates; the payment provider charges what its price says. */
  priceMinor: number;
  currency: string;
  /** Every module: scheduled searches that may be switched on at once, counted across all modules (Jobs' first). */
  scheduledSearches: number;
  /** Every module: whether a scheduled search may run every day or every weekday (else weekly). */
  dailySearches: boolean;
  /** Jobs: whether "Keep watch" (continuous) is allowed. */
  keepWatch: boolean;
  /** Every module: drafts written by WonderWorks AI per calendar month; a connected own-AI key never counts. */
  aiDraftsPerMonth: number;
  /** Jobs: roles the person can search as. */
  roles: number;
  /** Jobs: how many résumé designs, counted from the first in the gallery; 8 is all of them. */
  resumeTemplates: number;
  /** Jobs: the ATS report on a résumé. */
  atsReport: boolean;
  /** Jobs: applying with the WonderWorks helper on the employer's page. */
  applyWithWonder: boolean;
  /** Extra lines the operator adds to this plan's description on pricing, shown as written. Display only — nothing enforces them. */
  highlights: string[];
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
    free: { label: "Free", tagline: "Looking casually", priceMinor: 0, currency: "INR", scheduledSearches: 1, dailySearches: false, keepWatch: false, aiDraftsPerMonth: 5, roles: 1, resumeTemplates: 2, atsReport: false, applyWithWonder: false, highlights: [] },
    pro: { label: "Pro", tagline: "Actively applying", priceMinor: 49_900, currency: "INR", scheduledSearches: 3, dailySearches: true, keepWatch: false, aiDraftsPerMonth: 60, roles: 3, resumeTemplates: 8, atsReport: false, applyWithWonder: true, highlights: [] },
    max: { label: "Max", tagline: "Senior, or several roles at once", priceMinor: 129_900, currency: "INR", scheduledSearches: 10, dailySearches: true, keepWatch: true, aiDraftsPerMonth: 300, roles: 6, resumeTemplates: 8, atsReport: true, applyWithWonder: true, highlights: [] },
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
    highlights: z.array(z.string().trim().min(1).max(90)).max(10),
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
  // A paid month names its plan in the reference (`order:max`, domain/billing/prepaid.ts).
  if (ref === "order:max") return "max";
  if (ref === "order:pro") return "pro";
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

/**
 * What a plan allows, grouped as WonderWorks is (owner, 2026-11-02: "redesign this for works like WonderWorks instead
 * of just for jobs"): limits every module shares, and the ones only Jobs has. A module with no limits of its own uses
 * the shared ones; the admin's Plans & features page and pricing read this list.
 */
export type PlanFeatureKey = Exclude<keyof PlanLimits, "label" | "tagline" | "priceMinor" | "currency" | "highlights">;
export const PLAN_FEATURES: { key: PlanFeatureKey; scope: "every" | "jobs"; kind: "number" | "flag"; label: string; hint: string }[] = [
  { key: "scheduledSearches", scope: "every", kind: "number", label: "Scheduled searches on at once", hint: "Across every module, Jobs' counted first." },
  { key: "dailySearches", scope: "every", kind: "flag", label: "Scheduled searches can run daily", hint: "Every day or every weekday; otherwise once a week." },
  { key: "aiDraftsPerMonth", scope: "every", kind: "number", label: "WonderWorks AI drafts a month", hint: "Cover notes, answers and messages in every module; the person's own AI key never counts." },
  { key: "roles", scope: "jobs", kind: "number", label: "Roles to search as", hint: "Search as" },
  { key: "resumeTemplates", scope: "jobs", kind: "number", label: "Résumé designs", hint: "Counted from the first in the gallery; 8 is all." },
  { key: "keepWatch", scope: "jobs", kind: "flag", label: "Keep watch", hint: "A Jobs search that runs continuously." },
  { key: "applyWithWonder", scope: "jobs", kind: "flag", label: "Apply with the WonderWorks helper", hint: "Fills the employer's own page in the person's browser." },
  { key: "atsReport", scope: "jobs", kind: "flag", label: "ATS report", hint: "How an applicant tracking system reads a résumé." },
];

export type ScheduleCadence = "daily" | "weekly" | "keep_watch" | "manual";

/**
 * Which of a person's other modules' scheduled searches the plan lets run: the oldest first, after the Jobs searches
 * that are on (they keep their place, as they did before other modules had schedules). Ids, oldest first.
 */
export function allowedModuleSchedules(limits: Pick<PlanLimits, "scheduledSearches">, jobsEnabled: number, schedules: { id: string; enabled: boolean; createdAt: string }[]): Set<string> {
  const room = Math.max(0, limits.scheduledSearches - jobsEnabled);
  return new Set(
    schedules
      .filter((s) => s.enabled)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, room)
      .map((s) => s.id),
  );
}

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
