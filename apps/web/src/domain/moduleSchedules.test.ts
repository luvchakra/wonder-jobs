import { describe, expect, it } from "vitest";
import { afterRun, cleanSchedule, isScheduleDue, nextRunAt, runStateFor, SEEN_CAP } from "./moduleSchedules";

const IST = 330;
describe("module scheduled searches", () => {
  it("fires at the local hour: later today, else tomorrow; weekdays skip the weekend; weekly a week on", () => {
    // 2026-11-02 is a Monday. 06:00 IST = 00:30 UTC.
    expect(nextRunAt({ cadence: "daily", hour: 8, offsetMin: IST }, new Date("2026-11-02T00:30:00Z"))).toBe("2026-11-02T02:30:00.000Z");
    expect(nextRunAt({ cadence: "daily", hour: 8, offsetMin: IST }, new Date("2026-11-02T03:00:00Z"))).toBe("2026-11-03T02:30:00.000Z");
    // Friday 10:00 IST → Monday 08:00 IST.
    expect(nextRunAt({ cadence: "weekdays", hour: 8, offsetMin: IST }, new Date("2026-11-06T04:30:00Z"))).toBe("2026-11-09T02:30:00.000Z");
    expect(nextRunAt({ cadence: "weekly", hour: 8, offsetMin: IST }, new Date("2026-11-02T03:00:00Z"))).toBe("2026-11-09T02:30:00.000Z");
    expect(nextRunAt({ cadence: "weekly", hour: 8, offsetMin: IST }, new Date("2026-11-02T03:00:00Z"), true)).toBe("2026-11-03T02:30:00.000Z");
  });

  it("is due only when on and its time has come (or is within the early window)", () => {
    const at = new Date("2026-11-02T02:30:00Z");
    expect(isScheduleDue({ enabled: true }, { nextRunAt: at.toISOString() }, at)).toBe(true);
    expect(isScheduleDue({ enabled: false }, { nextRunAt: at.toISOString() }, at)).toBe(false);
    expect(isScheduleDue({ enabled: true }, { nextRunAt: "2026-11-02T03:00:00Z" }, at)).toBe(false);
    expect(isScheduleDue({ enabled: true }, { nextRunAt: "2026-11-02T03:00:00Z" }, at, 3_600_000)).toBe(true);
  });

  it("counts only listings not seen before, and keeps the seen list capped", () => {
    expect(afterRun(["a", "b"], ["b", "c", "c"])).toEqual({ fresh: ["c"], seen: ["b", "c", "a"] });
    expect(afterRun([], Array.from({ length: SEEN_CAP + 50 }, (_, i) => `x${i}`)).seen).toHaveLength(SEEN_CAP);
  });

  it("cleans what the person set, and refuses Jobs or no module", () => {
    const now = new Date("2026-11-02T00:30:00Z");
    expect(cleanSchedule({ module: "jobs" }, now, "s1")).toBeNull();
    expect(cleanSchedule({}, now, "s1")).toBeNull();
    const s = cleanSchedule({ module: "internships", query: "  design  ", places: ["Pune", " ", "Delhi"], cadence: "weekly", hour: 99 }, now, "s1")!;
    expect(s).toMatchObject({ module: "internships", query: "design", places: ["Pune", "Delhi"], cadence: "weekly", hour: 8, offsetMin: IST, enabled: true });
    const r = runStateFor(s, undefined, now);
    expect(r).toMatchObject({ nextRunAt: "2026-11-02T02:30:00.000Z", seen: [], primed: false });
    // Unchanged settings keep their state; changed words start afresh.
    const ran = { ...r, seen: ["a"], primed: true };
    expect(runStateFor(s, ran, now)).toBe(ran);
    expect(runStateFor({ ...s, query: "ux" }, ran, now).primed).toBe(false);
  });
});
