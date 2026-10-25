import type { Application } from "@/domain/applications/types";
import type { WorkflowRun } from "@/domain/workflow/types";

/**
 * This week's timeline (owner, 2026-10-25): the page reads one 7-day period at a time — the last 7 days, or any
 * week before, stepped back and forth — and every number on it is counted from the candidate's own runs and
 * applications inside that period, with the period before it for comparison. Local days, start inclusive.
 */
export const DAY = 86_400_000;

export interface Period {
  start: number;
  end: number;
}

/** The 7 days ending today (offset 0), or `offset` weeks before that. */
export function weekPeriod(now: number, offset: number): Period {
  const d = new Date(now);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - offset * 7 * DAY;
  return { start: end - 7 * DAY, end };
}

export const previous = (p: Period): Period => ({ start: p.start - (p.end - p.start), end: p.start });

const short = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** "19 – 25 Oct". */
export function periodLabel(p: Period): string {
  const [a, b] = [new Date(p.start), new Date(p.end - DAY)];
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${short(b.getTime())}` : `${short(a.getTime())} – ${short(b.getTime())}`;
}

const within = (p: Period, iso?: string) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= p.start && t < p.end;
};
const done = (r: WorkflowRun) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS";

export interface PeriodStats {
  /** Applications sent (their sent date in the period). */
  applied: number;
  /** Interviews dated in the period. */
  interviews: number;
  /** Jobs reviewed by completed searches. */
  reviewed: number;
  /** Strong matches those searches found. */
  strong: number;
  searches: number;
}

export function periodStats(p: Period, runs: WorkflowRun[], apps: Application[]): PeriodStats {
  const searches = runs.filter((r) => done(r) && within(p, r.completedAt));
  return {
    applied: apps.filter((a) => within(p, a.appliedAt)).length,
    interviews: apps.reduce((n, a) => n + a.followUps.filter((f) => f.kind === "interview" && within(p, f.dueAt)).length, 0),
    reviewed: searches.reduce((n, r) => n + (r.summary?.jobsRetained ?? 0), 0),
    strong: searches.reduce((n, r) => n + (r.summary?.strongMatches ?? 0), 0),
    searches: searches.length,
  };
}

export interface DayStats {
  at: number;
  reviewed: number;
  strong: number;
  searches: number;
  applied: number;
}

/** One entry per day of the period. */
export function perDay(p: Period, runs: WorkflowRun[], apps: Application[]): DayStats[] {
  const days: DayStats[] = [];
  // The next local midnight (a day isn't always 24 hours across a clock change).
  const next = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate() + 1).getTime();
  for (let t = p.start; t < p.end; t = next(t)) {
    const s = periodStats({ start: t, end: Math.min(p.end, next(t)) }, runs, apps);
    days.push({ at: t, reviewed: s.reviewed, strong: s.strong, searches: s.searches, applied: s.applied });
  }
  return days;
}

/** "+3 vs previous 7 days", "−2 vs …", "Same as previous 7 days". */
export function versus(now: number, before: number): string {
  if (now === before) return "Same as previous 7 days";
  const d = now - before;
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("en-IN")} vs previous 7 days`;
}

/** "45%" of a whole; "—" when there's nothing to divide by. */
export const pct = (n: number, of: number) => (!of ? "—" : n > 0 && n / of < 0.01 ? "<1%" : `${Math.round((n / of) * 100)}%`);
