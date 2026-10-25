import { describe, expect, it } from "vitest";
import type { Application } from "@/domain/applications/types";
import type { WorkflowRun } from "@/domain/workflow/types";
import { DAY, pct, perDay, periodLabel, periodStats, previous, versus, weekPeriod } from "./periods";

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const run = (completedAt: Date, jobsRetained: number, strongMatches: number, status = "COMPLETED") => ({ id: String(+completedAt), status, completedAt: completedAt.toISOString(), createdAt: completedAt.toISOString(), summary: { jobsRetained, strongMatches } }) as unknown as WorkflowRun;
const app = (appliedAt?: Date, interviewAt?: Date) => ({ appliedAt: appliedAt?.toISOString(), followUps: interviewAt ? [{ kind: "interview", dueAt: interviewAt.toISOString(), done: false }] : [] }) as unknown as Application;

describe("a week's numbers", () => {
  it("covers the 7 local days ending today, and steps back a week at a time", () => {
    const p = weekPeriod(NOW, 0);
    expect(new Date(p.start)).toEqual(new Date(2026, 9, 19));
    expect(p.end - p.start).toBe(7 * DAY);
    expect(weekPeriod(NOW, 1)).toEqual(previous(p));
  });

  it("counts only what falls inside the period, from completed searches", () => {
    const runs = [run(new Date(2026, 9, 24, 9), 500, 3), run(new Date(2026, 9, 24, 10), 90, 0, "STOPPED"), run(new Date(2026, 9, 10), 40, 1)];
    const apps = [app(new Date(2026, 9, 20)), app(new Date(2026, 9, 1), new Date(2026, 9, 23)), app()];
    expect(periodStats(weekPeriod(NOW, 0), runs, apps)).toEqual({ applied: 1, interviews: 1, reviewed: 500, strong: 3, searches: 1 });
    const days = perDay(weekPeriod(NOW, 0), runs, apps);
    expect(days).toHaveLength(7);
    expect(days[5]).toMatchObject({ reviewed: 500, strong: 3, searches: 1 });
  });

  it("compares with the period before and gives shares", () => {
    expect(versus(5, 2)).toBe("+3 vs previous 7 days");
    expect(versus(1, 4)).toBe("−3 vs previous 7 days");
    expect(versus(2, 2)).toBe("Same as previous 7 days");
    expect(pct(1, 4)).toBe("25%");
    expect(pct(1, 0)).toBe("—");
    expect(pct(10, 4364)).toBe("<1%");
    expect(periodLabel(weekPeriod(NOW, 0))).toBe("19 – 25 Oct");
  });
});
