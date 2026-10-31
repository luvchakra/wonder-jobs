/**
 * The platform scheduler's knobs, as a platform admin sets them (WorksLake admin → Scheduler). Each cron
 * reads these at the start of its run; anything missing or out of range falls back to the default, so a
 * bad value can never stop the cron outright or let it run past Vercel's time limit.
 */
export interface SchedulerSettings {
  /** The daily run (`/api/cron/scheduled-runs`): candidates' saved schedules, reminders and digests. */
  scheduledRuns: { enabled: boolean; maxTenants: number; tenantBudgetSec: number; reminders: boolean; digests: boolean };
  /** WorksLake's company refresh (`/api/cron/jobslake-companies`): the company directory and its logos. */
  companyRefresh: { enabled: boolean; logoLimit: number; budgetSec: number };
  /** WorksLake's company-ratings job (`/api/cron/jobslake-ratings`): how often it runs and who's told when it has no key left. */
  ratings: { enabled: boolean; frequency: RatingsFrequency; notifyEmail: string };
  updatedAt?: string;
  updatedBy?: string;
}

/** How often the ratings job runs. The cron ticks daily; the job runs when this much time has passed since its last run began. */
export const RATINGS_FREQUENCIES = {
  daily: { label: "Every day", days: 1 },
  weekly: { label: "Every week", days: 7 },
  biweekly: { label: "Every 2 weeks", days: 14 },
  monthly: { label: "Every month", days: 30 },
} as const;
export type RatingsFrequency = keyof typeof RATINGS_FREQUENCIES;

/** Who's emailed when the ratings job has no API key left and companies are still waiting (owner, 2026-10-24). */
export const DEFAULT_RATINGS_NOTIFY_EMAIL = "kunalc.iit@gmail.com";

/**
 * Whether the scheduled ratings job should run on this daily tick. `last` is the most recent scheduled run: it began
 * `startedAt`, and `status` is how it ended ("more": it ran out of time with keys and companies left, so the next tick
 * carries on). A run begun half a day short of the interval counts as due, so a cron that fires a few minutes early
 * doesn't wait a whole extra day.
 */
export function ratingsDue(freq: RatingsFrequency, last: { startedAt: string; status: string } | undefined, now: Date): boolean {
  if (!last) return true;
  if (last.status === "more") return true;
  const elapsed = now.getTime() - new Date(last.startedAt).getTime();
  return !(elapsed >= 0) || elapsed >= (RATINGS_FREQUENCIES[freq].days - 0.5) * 86_400_000;
}

export const SCHEDULER_DEFAULTS: SchedulerSettings = {
  scheduledRuns: { enabled: true, maxTenants: 200, tenantBudgetSec: 60, reminders: true, digests: true },
  companyRefresh: { enabled: true, logoLimit: 150, budgetSec: 45 },
  ratings: { enabled: true, frequency: "weekly", notifyEmail: DEFAULT_RATINGS_NOTIFY_EMAIL },
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
  const g = obj(r.ratings);
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
    ratings: {
      enabled: bool(g.enabled, D.ratings.enabled),
      frequency: typeof g.frequency === "string" && g.frequency in RATINGS_FREQUENCIES ? (g.frequency as RatingsFrequency) : D.ratings.frequency,
      notifyEmail: typeof g.notifyEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.notifyEmail.trim()) && g.notifyEmail.length <= 200 ? g.notifyEmail.trim().toLowerCase() : D.ratings.notifyEmail,
    },
    ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}),
  };
}

/** One cron invocation, as the admin page lists it. */
export interface CronRun {
  job: "scheduled-runs" | "jobslake-companies" | "jobslake-ratings" | "application-reminders" | "gateway-collect" | "reminders";
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
  { id: "scheduled-runs", runner: "vercel", path: "/api/cron/scheduled-runs", schedule: "0 2 * * *", label: "Daily run", description: "Candidates' saved schedules, follow-up and interview reminders, activity digests, billing reconciliation and retention purges." },
  { id: "jobslake-companies", runner: "vercel", path: "/api/cron/jobslake-companies", schedule: "30 1 * * *", label: "Company refresh", description: "WorksLake's company directory from the last two weeks of postings, their posting counts and missing logos." },
  { id: "jobslake-ratings", runner: "vercel", path: "/api/cron/jobslake-ratings", schedule: "50 1 * * *", label: "Company ratings", description: "Looks up employee-review ratings from Explorium for companies never looked up (or not for 90 days), on the frequency set in Company ratings. Emails the owner when no API key is left." },
  { id: "application-reminders", runner: "vercel", path: "/api/cron/application-reminders", schedule: "30 3 * * *", label: "Application reminders", description: "Deletes career-site applications past their site's retention period, then reminds hiring teams of applications with no decision for two days (every two days, at most three times)." },
  { id: "gateway-collect", runner: "vercel", path: "/api/cron/gateway-collect", schedule: "0 23 * * *", label: "Gateway collection", description: "Fetches the external sources an administrator has tested and activated in the WorksLake gateway (robots and permission checked again each time), for the modules each is approved for. Does nothing until the gateway is configured." },
  // Called by GitHub Actions (.github/workflows/reminders.yml): Vercel's plan runs its own crons once a day.
  { id: "reminders", runner: "github", path: "/api/cron/reminders", schedule: "17 * * * *", label: "Reminders", description: "Interview and follow-up reminders between daily runs, so one due this evening isn't raised tomorrow morning. Called by GitHub Actions; the daily run raises them too." },
] as const satisfies readonly { id: CronRun["job"]; runner: "vercel" | "github"; path: string; schedule: string; label: string; description: string }[];

// "30 1 * * *" → "Daily at 01:30 UTC"; minute 17 every third hour → "Every 3 hours at :17"; every hour → "Every hour at :17"; anything else as written.
export function describeCron(expr: string): string {
  const m = expr.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (m) return `Daily at ${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")} UTC`;
  const h = expr.match(/^(\d{1,2}) \* \* \* \*$/);
  if (h) return `Every hour at :${h[1].padStart(2, "0")}`;
  const e = expr.match(/^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/);
  return e ? `Every ${e[2]} hours at :${e[1].padStart(2, "0")}` : expr;
}

// When a daily cron, or one every N hours, next fires after `now`.
export function nextCronRun(expr: string, now: Date): string | undefined {
  const every = expr.match(/^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/) ?? expr.match(/^(\d{1,2}) \* \* \* \*$/);
  if (every) {
    const [minute, step] = [Number(every[1]), Number(every[2] ?? 1)];
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, minute));
    while (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + step);
    return next.toISOString();
  }
  const m = expr.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) return undefined;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1])));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
