import { describe, expect, it } from "vitest";
import { buildScheduledSearch, type ScheduledSearchInput } from "./simpleSchedule";

const base: ScheduledSearchInput = {
  ids: { workflow: "wf_1", schedule: "sch_1" },
  now: new Date("2026-09-24T10:00:00Z"),
  timezone: "Asia/Kolkata",
  frequency: "daily",
  onlyWhenWorthIt: true,
  careerGoal: "IAM leadership roles",
  query: "iam director",
  locations: ["Mumbai", "Remote"],
  workModes: ["remote", "hybrid"],
  level: "guided",
  provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
  sourceIds: ["jobicy"],
};

describe("buildScheduledSearch — the simple chooser produces the same records the scheduler already runs", () => {
  it("every day: a daily 8:00 schedule in the candidate's zone, notifying only on strong matches", () => {
    const { workflow, schedule } = buildScheduledSearch(base);
    expect(schedule).toMatchObject({ trigger: "schedule", frequency: "daily", time: "08:00", timezone: "Asia/Kolkata", condition: { key: "strong_matches", op: ">", value: 0 }, enabled: true, workflowId: "wf_1" });
    expect(schedule.nextRunAt).toBeTruthy();
    expect(workflow.config.notify).toBe("strong_matches_only");
    expect(workflow.config.searchCriteria).toEqual({ query: "iam director", locations: ["Mumbai", "Remote"], workModes: ["remote", "hybrid"], minSalary: undefined });
    expect(workflow.config.automationLevel).toBe("guided");
  });

  it("is discovery-only: a simple schedule never prepares or hands off applications", () => {
    const { workflow } = buildScheduledSearch(base);
    expect(workflow.stageKeys).toEqual(["profile", "search", "dedupe", "understand", "match", "quality", "rank"]);
    expect(workflow.stageKeys).not.toContain("prepare");
    expect(workflow.stageKeys).not.toContain("apply");
  });

  it("every week: Mondays at 9:00, and telling you every time when you asked for that", () => {
    const { workflow, schedule } = buildScheduledSearch({ ...base, frequency: "weekly", onlyWhenWorthIt: false });
    expect(schedule).toMatchObject({ frequency: "weekly", days: [1], time: "09:00", condition: { key: "always" } });
    expect(workflow.config.notify).toBe("always");
  });

  it("keep watch: forces the quiet condition and the Keep watch level, whatever else was chosen", () => {
    const { workflow, schedule } = buildScheduledSearch({ ...base, frequency: "keep_watch", onlyWhenWorthIt: false, level: "assist" });
    expect(schedule.condition.key).toBe("strong_matches");
    expect(workflow.config.automationLevel).toBe("continuous");
  });

  it("I'll search manually: saved with a manual trigger and no next run", () => {
    const { schedule } = buildScheduledSearch({ ...base, frequency: "manual" });
    expect(schedule.trigger).toBe("manual");
    expect(schedule.nextRunAt).toBeUndefined();
  });
});
