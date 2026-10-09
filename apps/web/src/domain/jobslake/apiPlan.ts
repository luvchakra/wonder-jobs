/**
 * The JobsLake API plan: a free monthly allowance per account, then pay-as-you-go when the account
 * turned it on, and a hard monthly safety cap either way. Pure functions — the server meters usage
 * and asks these whether a request may run and what to report to Stripe.
 *
 * Units: one per search (REST, stream or MCP search_jobs) and one per refresh. Reading an
 * opportunity is free. Months are calendar months in UTC.
 */

export interface ApiPlanConfig {
  /** Free units per account per calendar month (UTC). */
  freeMonthly: number;
  /** No account goes past this in a month, paid or not — a runaway client can't run up a bill. */
  maxMonthly: number;
}

const posInt = (v: string | undefined, dflt: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max ? n : dflt;
};

/** What a billing admin stored on the platform (Billing → JobsLake API); any field may be unset. */
export interface StoredApiPlan {
  freeMonthly?: number;
  maxMonthly?: number;
  sourceIds?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

const storedInt = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);

/** The plan in force: the admin's stored value first, then the environment, then the defaults. */
export function apiPlanConfig(env: Record<string, string | undefined> = process.env, stored?: StoredApiPlan): ApiPlanConfig {
  const freeMonthly = storedInt(stored?.freeMonthly, 10_000_000) ?? posInt(env.JOBSLAKE_API_FREE_SEARCHES, 100, 10_000_000);
  const maxMonthly = Math.max(freeMonthly, storedInt(stored?.maxMonthly, 100_000_000) ?? posInt(env.JOBSLAKE_API_MAX_MONTHLY, 100_000, 100_000_000));
  return { freeMonthly, maxMonthly };
}

export type QuotaDecision = { allowed: true; billable: boolean } | { allowed: false; reason: "free_exhausted" | "safety_cap"; message: string };

/**
 * Whether a request that brings this month's total to `totalAfter` may run. `totalAfter` already
 * includes the request's own units (the server meters first, atomically, then asks).
 * `billingActive` must be false whenever pay-as-you-go can't be confirmed — this fails closed.
 */
export function decideQuota(input: { totalAfter: number; units: number; billingActive: boolean; config: ApiPlanConfig }): QuotaDecision {
  const { totalAfter, billingActive, config } = input;
  if (totalAfter > config.maxMonthly) {
    return { allowed: false, reason: "safety_cap", message: `This account reached the monthly safety limit of ${config.maxMonthly.toLocaleString("en-US")} API units. It resets on the 1st (UTC).` };
  }
  if (totalAfter <= config.freeMonthly) return { allowed: true, billable: false };
  if (!billingActive) {
    return {
      allowed: false,
      reason: "free_exhausted",
      message: `This account used its ${config.freeMonthly.toLocaleString("en-US")} free JobsLake API searches this month. Turn on pay-as-you-go under Account → JobsLake API, or wait until the 1st (UTC).`,
    };
  }
  // Past the allowance (or straddling it): billed through pay-as-you-go.
  return { allowed: true, billable: true };
}

/**
 * A metered price as Stripe states it — `unitAmountDecimal` in the currency's minor unit, possibly
 * fractional — for people: "$0.01 per search", "₹50.00 per 100 searches".
 */
export function formatApiPrice(p: { unitAmountDecimal: string; currency: string; perUnits: number }, locale = "en-US"): string {
  const digits = new Intl.NumberFormat(locale, { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const major = Number(p.unitAmountDecimal) / 10 ** digits;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: p.currency, minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 6) }).format(major);
  return p.perUnits > 1 ? `${money} per ${p.perUnits.toLocaleString(locale)} searches` : `${money} per search`;
}

/** "2026-10-09" for a time, in UTC. */
export const utcDay = (at: Date | number = Date.now()) => new Date(at).toISOString().slice(0, 10);
export const monthOf = (day: string) => day.slice(0, 7);
export const monthStart = (day: string) => `${monthOf(day)}-01`;

export interface UsageDay {
  day: string;
  units: number;
  /** Overage units already reported to Stripe for this day. */
  reportedUnits: number;
}

export interface MeterReport {
  day: string;
  /** Overage units to report for the day. */
  value: number;
  /** Stripe's dedupe key for the meter event: one per account per day, ever. */
  identifier: string;
  /** End of the day, in unix seconds — the meter event's timestamp. */
  timestamp: number;
}

/**
 * The meter events still owed for an account: for each complete day (before `today`) whose usage
 * went past the month's free allowance, the overage units that day added — counted cumulatively
 * within the day's calendar month — unless that day was already reported. A day is reported once,
 * whole, after it ends, so its value is final and the identifier never needs reusing.
 */
export function overageReports(ownerId: string, days: UsageDay[], freeMonthly: number, today: string): MeterReport[] {
  const out: MeterReport[] = [];
  const cumulative = new Map<string, number>();
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const m = monthOf(d.day);
    const before = cumulative.get(m) ?? 0;
    const after = before + Math.max(0, d.units);
    cumulative.set(m, after);
    if (d.day >= today) continue;
    const overage = Math.max(0, after - freeMonthly) - Math.max(0, before - freeMonthly);
    if (overage <= 0 || d.reportedUnits > 0) continue;
    out.push({ day: d.day, value: overage, identifier: `jl:${ownerId}:${d.day}`, timestamp: Math.floor(Date.parse(`${d.day}T23:59:59Z`) / 1000) });
  }
  return out;
}
