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
