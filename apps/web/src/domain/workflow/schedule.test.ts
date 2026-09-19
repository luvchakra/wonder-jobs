import { describe, expect, it } from "vitest";
import { nextScheduledRun } from "./schedule";

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
