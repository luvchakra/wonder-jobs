/**
 * The platform scheduler's knobs, as a platform admin sets them (JobsLake admin → Scheduler). Each cron
 * reads these at the start of its run; anything missing or out of range falls back to the default, so a
 * bad value can never stop the cron outright or let it run past Vercel's time limit.
 */
export interface SchedulerSettings {
  /** The daily run (`/api/cron/scheduled-runs`): candidates' saved schedules, reminders and digests. */
  scheduledRuns: { enabled: boolean; maxTenants: number; tenantBudgetSec: number; reminders: boolean; digests: boolean };
  /** JobsLake's company refresh (`/api/cron/jobslake-companies`): the company directory and its logos. */
  companyRefresh: { enabled: boolean; logoLimit: number; budgetSec: number };
  updatedAt?: string;
  updatedBy?: string;
}

export const SCHEDULER_DEFAULTS: SchedulerSettings = {
  scheduledRuns: { enabled: true, maxTenants: 200, tenantBudgetSec: 60, reminders: true, digests: true },
  companyRefresh: { enabled: true, logoLimit: 150, budgetSec: 45 },
};

/** Each number's allowed range — the time budgets stay inside each function's Vercel limit. */
export const SCHEDULER_LIMITS = {
  maxTenants: [1, 500],
  tenantBudgetSec: [10, 120],
  logoLimit: [0, 500],
  budgetSec: [5, 50],
} as const;

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const int = (v: unknown, [lo, hi]: readonly [number, number], d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Stored or submitted settings, every field checked; anything unusable is the default. */
export function cleanScheduler(raw: unknown): SchedulerSettings {
  const r = obj(raw);
  const s = obj(r.scheduledRuns);
  const c = obj(r.companyRefresh);
  const D = SCHEDULER_DEFAULTS;
  return {
    scheduledRuns: {
      enabled: bool(s.enabled, D.scheduledRuns.enabled),
      maxTenants: int(s.maxTenants, SCHEDULER_LIMITS.maxTenants, D.scheduledRuns.maxTenants),
      tenantBudgetSec: int(s.tenantBudgetSec, SCHEDULER_LIMITS.tenantBudgetSec, D.scheduledRuns.tenantBudgetSec),
      reminders: bool(s.reminders, D.scheduledRuns.reminders),
      digests: bool(s.digests, D.scheduledRuns.digests),
    },
    companyRefresh: {
      enabled: bool(c.enabled, D.companyRefresh.enabled),
      logoLimit: int(c.logoLimit, SCHEDULER_LIMITS.logoLimit, D.companyRefresh.logoLimit),
      budgetSec: int(c.budgetSec, SCHEDULER_LIMITS.budgetSec, D.companyRefresh.budgetSec),
    },
    ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}),
  };
}

/** One cron invocation, as the admin page lists it. */
export interface CronRun {
  job: "scheduled-runs" | "jobslake-companies" | "application-reminders";
  trigger: "cron" | "admin";
  startedAt: string;
  finishedAt: string;
  outcome: "ok" | "skipped" | "failed";
  /** A few counts in words ("3 tenants due · 3 ran"), never a tenant's data. */
  summary: string;
}

export const MAX_CRON_RUNS = 60;

/** The platform's cron jobs as `vercel.json` declares them (a unit test holds the two together). Times are UTC. */
export const CRON_JOBS = [
  { id: "scheduled-runs", path: "/api/cron/scheduled-runs", schedule: "0 2 * * *", label: "Daily run", description: "Candidates' saved schedules, follow-up and interview reminders, activity digests, billing reconciliation and retention purges." },
  { id: "jobslake-companies", path: "/api/cron/jobslake-companies", schedule: "30 1 * * *", label: "Company refresh", description: "JobsLake's company directory from the last two weeks of postings, their posting counts and missing logos." },
  { id: "application-reminders", path: "/api/cron/application-reminders", schedule: "30 3 * * *", label: "Application reminders", description: "Reminds hiring teams of career-site applications with no decision for two days, every two days, at most three times." },
] as const satisfies readonly { id: CronRun["job"]; path: string; schedule: string; label: string; description: string }[];

/** "30 1 * * *" → "Daily at 01:30 UTC" (the only shape these crons use); anything else is shown as written. */
export function describeCron(expr: string): string {
  const m = expr.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  return m ? `Daily at ${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")} UTC` : expr;
}

/** When a daily "m h * * *" cron next fires after `now`. */
export function nextCronRun(expr: string, now: Date): string | undefined {
  const m = expr.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) return undefined;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1])));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
