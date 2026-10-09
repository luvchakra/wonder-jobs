import { describe, expect, it } from "vitest";
import { advancedFrom, isDue, nextScheduledRun } from "./schedule";

const ist = "Asia/Kolkata";

describe("nextScheduledRun", () => {
  it("fires daily at the schedule's wall-clock time in its own zone", () => {
    // 02:00 UTC on a Wednesday = 07:30 IST, so 08:00 IST is still ahead.
    const next = nextScheduledRun({ frequency: "daily", days: [], time: "08:00", timezone: ist }, new Date("2026-04-15T02:00:00Z"));
    expect(next).toBe("2026-04-15T02:30:00.000Z");
  });

  it("rolls to the next day once today's time has passed", () => {
    const next = nextScheduledRun({ frequency: "daily", days: [], time: "08:00", timezone: ist }, new Date("2026-04-15T03:00:00Z"));
    expect(next).toBe("2026-04-16T02:30:00.000Z");
  });

  it("skips the weekend for weekday schedules", () => {
    // 2026-04-18 is a Saturday in IST.
    const next = nextScheduledRun({ frequency: "weekdays", days: [], time: "09:00", timezone: ist }, new Date("2026-04-18T06:00:00Z"));
    expect(next).toBe("2026-04-20T03:30:00.000Z"); // Monday 09:00 IST
  });

  it("honours the selected weekday for weekly schedules", () => {
    const next = nextScheduledRun({ frequency: "weekly", days: [1], time: "09:00", timezone: ist }, new Date("2026-04-15T06:00:00Z"));
    expect(new Date(next!).getUTCDay()).toBe(1);
  });

  it("keeps the local hour across a daylight-saving change", () => {
    // US DST starts 2026-03-08; 08:00 New York is 13:00 UTC before and 12:00 UTC after.
    const before = nextScheduledRun({ frequency: "daily", days: [], time: "08:00", timezone: "America/New_York" }, new Date("2026-03-06T14:00:00Z"));
    const after = nextScheduledRun({ frequency: "daily", days: [], time: "08:00", timezone: "America/New_York" }, new Date("2026-03-09T01:00:00Z"));
    expect(before).toBe("2026-03-07T13:00:00.000Z");
    expect(after).toBe("2026-03-09T12:00:00.000Z");
  });

  it("fires monthly on the chosen day of month", () => {
    const next = nextScheduledRun({ frequency: "monthly", days: [1], time: "09:00", timezone: ist }, new Date("2026-04-15T06:00:00Z"));
    expect(next).toBe("2026-05-01T03:30:00.000Z");
  });

  it("falls back to the host clock for an unknown zone rather than never firing", () => {
    expect(nextScheduledRun({ frequency: "daily", days: [], time: "08:00", timezone: "Mars/Olympus" }, new Date("2026-04-15T02:00:00Z"))).toBeTruthy();
  });

  it("returns undefined when the rule can never fire", () => {
    expect(nextScheduledRun({ frequency: "weekly", days: [], time: "08:00", timezone: ist }, new Date("2026-04-15T02:00:00Z"))).toBeUndefined();
  });
});

describe("isDue", () => {
  const now = new Date("2026-04-15T03:00:00.000Z");
  const base = { enabled: true, trigger: "schedule" as const, nextRunAt: "2026-04-15T02:30:00.000Z", lastRunAt: undefined };

  it("is due once its time has passed", () => {
    expect(isDue(base, now)).toBe(true);
  });

  it("is not due before its time, when disabled, or when it isn't a schedule", () => {
    expect(isDue({ ...base, nextRunAt: "2026-04-16T02:30:00.000Z" }, now)).toBe(false);
    expect(isDue({ ...base, enabled: false }, now)).toBe(false);
    expect(isDue({ ...base, trigger: "manual" }, now)).toBe(false);
    expect(isDue({ ...base, nextRunAt: undefined }, now)).toBe(false);
  });

  it("an evening run doesn't swallow the next morning's search (the 2026-10-09 miss)", () => {
    // Set up / run at 21:01 IST; the 08:00 IST search is due at 02:30Z; the daily cron wakes at 02:19Z with an hour's window.
    const s = { ...base, nextRunAt: "2026-10-09T02:30:00.000Z", lastRunAt: "2026-10-08T15:31:46.454Z" };
    expect(isDue(s, new Date("2026-10-09T02:19:59.000Z"), 60 * 60_000)).toBe(true);
    // Once the cron took it at 02:19Z (and before nextRunAt moved on), neither scheduler fires it again.
    expect(isDue({ ...s, lastRunAt: "2026-10-09T02:20:30.000Z" }, new Date("2026-10-09T02:31:00.000Z"))).toBe(false);
  });

  it("stands down when the schedule already ran today, whoever fired it", () => {
    // The guard that lets the browser ticker and the server cron coexist without double-firing.
    expect(isDue({ ...base, lastRunAt: "2026-04-15T02:31:00.000Z" }, now)).toBe(false);
    expect(isDue({ ...base, lastRunAt: "2026-04-14T02:31:00.000Z" }, now)).toBe(true);
  });

  it("with an early window, takes an occurrence that's about to come up — the once-a-day cron waking at 07:49 for an 08:00 search", () => {
    const wake = new Date("2026-04-15T02:19:58.000Z"); // 07:49:58 in Asia/Kolkata; the search is at 08:00 (02:30Z)
    expect(isDue(base, wake)).toBe(false); // on the minute only: it would wait a whole day
    expect(isDue(base, wake, 60 * 60_000)).toBe(true);
    expect(isDue(base, wake, 5 * 60_000)).toBe(false); // ten minutes away is outside a five-minute window
    expect(isDue({ ...base, nextRunAt: "2026-04-15T03:30:00.000Z" }, wake, 60 * 60_000)).toBe(false); // more than an hour away
    // A run the evening before took an earlier occurrence (or was a "Run now"): this morning's is still owed.
    expect(isDue({ ...base, lastRunAt: "2026-04-14T22:00:00.000Z" }, wake, 60 * 60_000)).toBe(true);
    // A run within the hour before the occurrence took it, and a negative window means none.
    expect(isDue({ ...base, lastRunAt: "2026-04-15T01:49:00.000Z" }, wake, 60 * 60_000)).toBe(false);
    expect(isDue(base, wake, -60_000)).toBe(false);
  });
});

describe("advancedFrom", () => {
  it("looks for the next occurrence after the one just taken, even when it was taken early", () => {
    const early = new Date("2026-04-15T02:19:58.000Z");
    const s = { frequency: "daily" as const, days: [], time: "08:00", timezone: "Asia/Kolkata", nextRunAt: "2026-04-15T02:30:00.000Z" };
    const hour = 60 * 60_000;
    expect(nextScheduledRun(s, advancedFrom(s, early, hour))).toBe("2026-04-16T02:30:00.000Z"); // tomorrow, not 08:00 today again
    // Catching up on yesterday's 08:00 at 07:49 also covers today's: the next is tomorrow's — the production case.
    expect(nextScheduledRun(s, advancedFrom({ nextRunAt: "2026-04-14T02:30:00.000Z" }, early, hour))).toBe("2026-04-16T02:30:00.000Z");
    // Without a window (the browser, a frequent cron): from the occurrence or now, as before.
    expect(advancedFrom(s, early).toISOString()).toBe("2026-04-15T02:30:00.000Z");
    const late = new Date("2026-04-15T05:00:00.000Z");
    expect(advancedFrom(s, late).getTime()).toBe(late.getTime());
    expect(advancedFrom({ nextRunAt: undefined }, late).getTime()).toBe(late.getTime());
  });
});
