/**
 * Scheduled searches in every module (owner, 2026-11-01: "go ahead with automation"). A module's search — the same
 * words and places its Find takes — run by the server on a schedule, telling the person only when it finds listings
 * that weren't there before (Jobs' "only when worth it"). The first run only learns what's already there.
 * Pure: the store (wj.m.schedules), the cron and the Automation page all use these rules.
 */
export type ModuleScheduleCadence = "daily" | "weekdays" | "weekly";

/** What the person set (their synced store, wj.m.schedules). */
export interface ModuleSchedule {
  id: string;
  /** A module id other than Jobs (Jobs keeps its own scheduled searches). */
  module: string;
  query: string;
  places: string[];
  cadence: ModuleScheduleCadence;
  /** Local hour 0–23, and the person's UTC offset in minutes when they set it. */
  hour: number;
  offsetMin: number;
  enabled: boolean;
  createdAt: string;
}

/** What the server recorded (server-only store, wj.schedruns), so a browser can never overwrite it. */
export interface ScheduleRunState {
  /** The settings this state belongs to; changed settings start afresh. */
  key: string;
  nextRunAt: string;
  lastRunAt?: string;
  /** What the last run found: how many listings, how many new, or why it failed. */
  last?: { found: number; fresh: number; error?: string };
  /** Listing ids already seen, newest first, capped. */
  seen: string[];
  /** True once a run has learned what's already there (the first run never notifies). */
  primed: boolean;
}

/** The settings that make a schedule what it is: change any, and its run state starts again. */
export const scheduleKey = (s: Pick<ModuleSchedule, "module" | "query" | "places" | "cadence" | "hour" | "offsetMin">) => [s.module, s.query.toLowerCase(), s.places.join("|").toLowerCase(), s.cadence, s.hour, s.offsetMin].join("~");

/** The run state for a schedule: the stored one while its settings are unchanged, else a fresh one. */
export function runStateFor(s: ModuleSchedule, stored: ScheduleRunState | undefined, now: Date): ScheduleRunState {
  const key = scheduleKey(s);
  if (stored && stored.key === key) return stored;
  // A new schedule's first run is the first hour after it was made; changed settings start from now.
  const from = stored ? now : new Date(Math.min(now.getTime(), Date.parse(s.createdAt) || now.getTime()));
  return { key, nextRunAt: nextRunAt(s, from, true), seen: [], primed: false };
}

export const MODULE_SCHEDULES_CAP = 10;
export const SEEN_CAP = 300;
export const CADENCE_LABEL: Record<ModuleScheduleCadence, string> = { daily: "Every day", weekdays: "Every weekday", weekly: "Every week" };

/** The next time the schedule fires after `from`, at its local hour; weekly is a week after a run (`first`: the first run comes at the next hour, to learn what's there). */
export function nextRunAt(s: Pick<ModuleSchedule, "cadence" | "hour" | "offsetMin">, from: Date, first = false): string {
  const off = s.offsetMin * 60_000;
  const local = new Date(from.getTime() + off);
  const at = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), s.hour, 0, 0));
  if (at.getTime() <= local.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  if (s.cadence === "weekly" && !first) at.setUTCDate(at.getUTCDate() + 6);
  if (s.cadence === "weekdays") while (at.getUTCDay() === 0 || at.getUTCDay() === 6) at.setUTCDate(at.getUTCDate() + 1);
  return new Date(at.getTime() - off).toISOString();
}

/** Due now (or within `earlyMs`, for a once-a-day cron). */
export const isScheduleDue = (s: Pick<ModuleSchedule, "enabled">, r: Pick<ScheduleRunState, "nextRunAt">, now: Date, earlyMs = 0) => s.enabled && Date.parse(r.nextRunAt) <= now.getTime() + earlyMs;

/** After a run: the ids not seen before, and the seen list with this run's ids first, capped. */
export function afterRun(seen: string[], ids: string[]): { fresh: string[]; seen: string[] } {
  const known = new Set(seen);
  const fresh = [...new Set(ids)].filter((id) => !known.has(id));
  return { fresh, seen: [...new Set([...ids, ...seen])].slice(0, SEEN_CAP) };
}

/** A schedule as the person made it: words and places trimmed and capped, a valid cadence and hour. Null when invalid. */
export function cleanSchedule(raw: Partial<ModuleSchedule>, now: Date, id: string): ModuleSchedule | null {
  if (typeof raw.module !== "string" || !raw.module || raw.module === "jobs") return null;
  const cadence: ModuleScheduleCadence = raw.cadence === "weekdays" || raw.cadence === "weekly" ? raw.cadence : "daily";
  const hour = Number.isInteger(raw.hour) && raw.hour! >= 0 && raw.hour! <= 23 ? raw.hour! : 8;
  const offsetMin = Number.isInteger(raw.offsetMin) && Math.abs(raw.offsetMin!) <= 14 * 60 ? raw.offsetMin! : 330;
  const base = { cadence, hour, offsetMin };
  return {
    id,
    module: raw.module,
    query: String(raw.query ?? "").trim().slice(0, 120),
    places: (raw.places ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 5),
    ...base,
    enabled: raw.enabled !== false,
    createdAt: now.toISOString(),
  };
}
