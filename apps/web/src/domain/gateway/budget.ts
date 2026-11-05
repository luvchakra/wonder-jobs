/**
 * The scheduled import's pace, set so a full month fits the free plans it runs on (owner, 2026-11-02: "ensure that the
 * automated import frequency is set in a way so it can run a full month on free subscription").
 *
 * - Vercel Hobby: about 4 hours of active CPU and 360 GB-hours of function memory a month, shared with every page and
 *   search. The import is the one thing that runs on its own, so it gets a small, fixed share.
 * - GitHub Actions: the repository is public, so its scheduled triggers cost nothing, but GitHub fires them late or not
 *   at all when busy; Vercel's daily cron is the backstop.
 * - Supabase Free: 500 MB; listings are replaced per source, so collecting more often doesn't grow the database.
 *
 * Each source keeps its own interval (Sources → Import → Details); these only set the floor. Admin presses
 * (Import now, a module's import, a source's Collect) are never held back.
 */

/** The scheduled trigger's cadence (.github/workflows/gateway-collect.yml), in hours. */
export const TRIGGER_EVERY_HOURS = 3;
/** A scheduled trigger sooner than this after the last one does nothing (a late and an on-time trigger landing together). */
export const MIN_GAP_MINUTES = TRIGGER_EVERY_HOURS * 60 - 30;
/** No source is collected on schedule more often than this, whatever its own interval. */
export const SOURCE_FLOOR_MINUTES = 360;

/** At most this many scheduled collections a month, and at most this many collections of one source. */
export const MONTHLY = { runs: Math.ceil((30 * 24) / TRIGGER_EVERY_HOURS), perSource: Math.ceil((30 * 24 * 60) / SOURCE_FLOOR_MINUTES) };

/** The line Sources → Import shows for the schedule. */
export const SCHEDULE_LINE = `Every ${TRIGGER_EVERY_HOURS} hours, each source at most every ${SOURCE_FLOOR_MINUTES / 60} hours: at most ${MONTHLY.runs} runs and ${MONTHLY.perSource} collections per source a month, within the free plans.`;
