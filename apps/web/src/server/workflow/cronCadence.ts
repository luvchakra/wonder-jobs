/**
 * How often the scheduled-run cron actually runs, and therefore who ticks schedules.
 *
 * Vercel's Hobby plan invokes a cron once a day, which is fine as a safety net but far too coarse for
 * "every weekday at 08:00". So the deployment declares its cadence and the product adapts: a cron that
 * runs at least hourly owns scheduling outright and the browser stands down; a daily one is a backstop
 * and the open tab still fires schedules at their proper time. Either way both sides refuse to re-run a
 * schedule that has already run today, so they can never double-fire.
 */
export const DEFAULT_CRON_INTERVAL_MINUTES = 1440;
/** At or below this, the cron is punctual enough to be the only scheduler. */
const OWNS_SCHEDULING_AT_OR_BELOW = 60;

export function cronIntervalMinutes(): number {
  if (!process.env.CRON_SECRET) return 0;
  const raw = Number(process.env.CRON_INTERVAL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CRON_INTERVAL_MINUTES;
}

export function cronOwnsScheduling(): boolean {
  const minutes = cronIntervalMinutes();
  return minutes > 0 && minutes <= OWNS_SCHEDULING_AT_OR_BELOW;
}
