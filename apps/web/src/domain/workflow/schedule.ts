/**
 * When does a schedule next fire?
 *
 * The browser used to answer this with `Date#setHours`, i.e. in whatever zone the tab happened to be
 * in. That was fine while only the open tab fired schedules; a server cron runs in UTC, so "every
 * weekday at 08:00" would have drifted to 08:00 UTC for everyone. Each schedule carries the zone it
 * was created in (spec §19) and this module honours it, so the client and the cron agree on the
 * instant no matter where either of them runs.
 */
import type { WorkflowSchedule } from "./types";

export type ScheduleShape = Pick<WorkflowSchedule, "frequency" | "days" | "time"> & { timezone?: string };

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat | undefined {
  const cached = formatters.get(timezone);
  if (cached) return cached;
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    formatters.set(timezone, f);
    return f;
  } catch {
    // An unknown zone (stale data, a typo) must not stop the schedule firing — fall back to the host clock.
    return undefined;
  }
}

function partsIn(at: Date, timezone: string | undefined): ZoneParts {
  const f = timezone ? formatter(timezone) : undefined;
  if (!f) return { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate(), hour: at.getHours(), minute: at.getMinutes(), second: at.getSeconds() };
  const got: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") got[p.type] = Number(p.value);
  // Some zones format midnight as hour 24; normalize so arithmetic stays sane.
  return { year: got.year, month: got.month, day: got.day, hour: got.hour === 24 ? 0 : got.hour, minute: got.minute, second: got.second };
}

/** Milliseconds the zone is ahead of UTC at that instant (DST-aware). */
function offsetAt(ts: number, timezone: string): number {
  const p = partsIn(new Date(ts), timezone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
}

/** The instant at which a wall-clock time in `timezone` occurs. Two passes so DST transitions land right. */
function instantOf(p: Omit<ZoneParts, "second">, timezone: string | undefined): number {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  if (!timezone || !formatter(timezone)) return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0).getTime();
  const first = wall - offsetAt(wall, timezone);
  const second = wall - offsetAt(first, timezone);
  return second;
}

function fires(s: ScheduleShape, p: ZoneParts): boolean {
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  switch (s.frequency) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
      return s.days.includes(weekday);
    case "monthly":
      return p.day === (s.days[0] ?? 1);
  }
}

/**
 * The next occurrence strictly after `from`, as an ISO instant — or undefined when the rule can never
 * fire (a weekly schedule with no days selected). Looks two months ahead, enough for every frequency.
 */
export function nextScheduledRun(s: ScheduleShape, from: Date = new Date()): string | undefined {
  const [hour, minute] = s.time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  // Walk calendar dates, not 24-hour steps: a DST transition changes the length of a day but never
  // the sequence of dates, so this can't skip or repeat one.
  const today = partsIn(from, s.timezone);
  for (let i = 0; i < 62; i++) {
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const day = { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate(), hour, minute, second: 0 };
    if (!fires(s, day)) continue;
    const at = instantOf(day, s.timezone);
    if (at > from.getTime()) return new Date(at).toISOString();
  }
  return undefined;
}

/**
 * Whether the occurrence `nextRunAt` names has already been taken. A scheduler may take an occurrence
 * up to an hour early (the once-a-day cron; see `isDue`), so a run at or after `nextRunAt` minus that
 * hour (plus a little slack) took it — whoever ran it, and however stale the other scheduler's copy of
 * `nextRunAt` is. That's what lets the browser's ticker and the server cron coexist without firing
 * twice. A run before that took an earlier occurrence (or was a "Run now"), so this one is still owed.
 *
 * A take only counts while it's fresh (12 h): an older one means `nextRunAt` was left on an occurrence
 * that's long gone, and the schedule catches up instead of waiting forever.
 *
 * (This replaced a flat "ran in the last 12 hours" guard, which skipped the next morning's run of any
 * schedule set up or run after ~8 pm the evening before.)
 */
export const TAKE_WINDOW_MS = 65 * 60 * 1000;
/** A take older than this can't be today's: `nextRunAt` was left pointing at a past occurrence, so catch up. */
const TAKE_FRESH_MS = 12 * 60 * 60 * 1000;

export function tookOccurrence(s: Pick<WorkflowSchedule, "lastRunAt" | "nextRunAt">, now: Date = new Date()): boolean {
  if (!s.lastRunAt || !s.nextRunAt) return false;
  const ran = new Date(s.lastRunAt).getTime();
  const due = new Date(s.nextRunAt).getTime();
  if (!Number.isFinite(ran) || !Number.isFinite(due)) return false;
  return ran >= due - TAKE_WINDOW_MS && now.getTime() - ran < TAKE_FRESH_MS;
}

/**
 * Is this schedule due to fire right now? The one definition both schedulers use.
 *
 * `earlyMs` lets a scheduler that only wakes once a day take an occurrence that is about to come up,
 * rather than leave it for its next wake a day later: Vercel's Hobby cron fires once a day, at some
 * minute within its hour, so an 08:00 search would otherwise run at 07:49 tomorrow instead of today.
 * The browser and a frequent cron pass 0 and fire on the minute.
 */
export function isDue(s: Pick<WorkflowSchedule, "enabled" | "trigger" | "nextRunAt" | "lastRunAt">, now: Date = new Date(), earlyMs = 0): boolean {
  if (!s.enabled || s.trigger !== "schedule" || !s.nextRunAt) return false;
  if (new Date(s.nextRunAt).getTime() > now.getTime() + Math.max(0, earlyMs)) return false;
  return !tookOccurrence(s, now);
}

/**
 * Where to look for a schedule's next occurrence once it has fired: after the occurrence it just took
 * and after the early window it fired within. A run at 07:49 with an hour's window has covered 08:00,
 * whether it was taking 08:00 itself or catching up on yesterday's — so the next one is tomorrow's.
 */
export function advancedFrom(s: Pick<WorkflowSchedule, "nextRunAt">, now: Date, earlyMs = 0): Date {
  const covered = now.getTime() + Math.max(0, earlyMs);
  const at = s.nextRunAt ? new Date(s.nextRunAt).getTime() : NaN;
  return new Date(Number.isFinite(at) && at > covered ? at : covered);
}
