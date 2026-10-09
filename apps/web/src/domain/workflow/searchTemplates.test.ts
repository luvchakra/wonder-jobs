import { describe, expect, it } from "vitest";
import { isServerStage } from "@/server/workflow/serverExecutors";
import { SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import { buildFromTemplate, CADENCES, cadenceId, SEARCH_TEMPLATES } from "./searchTemplates";
import type { ScheduledSearchInput } from "./simpleSchedule";

const input: Omit<ScheduledSearchInput, "frequency" | "onlyWhenWorthIt"> = {
  ids: { workflow: "wf_1", schedule: "sch_1" },
  now: new Date("2026-10-09T10:00:00Z"),
  timezone: "Asia/Kolkata",
  careerGoal: "IAM leadership",
  query: "iam director",
  locations: ["Mumbai, India"],
  workModes: ["hybrid", "onsite"],
  level: "guided",
  provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
  sourceIds: ["adzuna_in"],
};

describe("ready-made scheduled searches", () => {
  it("are all searches the server runs on its own — nothing that waits for the candidate to be in the app", () => {
    for (const t of SEARCH_TEMPLATES) {
      const { workflow } = buildFromTemplate(t, input);
      expect(workflow.stageKeys.every(isServerStage)).toBe(true);
      expect(workflow.stageKeys).toContain("search");
    }
    for (const t of SCHEDULE_TEMPLATES) expect(t.stageKeys.every(isServerStage)).toBe(true);
  });

  it("search what the candidate asked for, on the template's cadence, quiet or not as it says", () => {
    const remote = buildFromTemplate(SEARCH_TEMPLATES.find((t) => t.id === "remote_watch")!, input);
    expect(remote.workflow.config.searchCriteria).toMatchObject({ query: "iam director", locations: ["Mumbai, India"], workModes: ["remote"] });
    expect(remote.schedule).toMatchObject({ frequency: "daily", time: "08:00", condition: { key: "strong_matches" } });
    const weekly = buildFromTemplate(SEARCH_TEMPLATES.find((t) => t.id === "weekly_roundup")!, input);
    expect(weekly.schedule).toMatchObject({ frequency: "weekly", days: [1], time: "09:00", condition: { key: "always" } });
    expect(weekly.workflow.config.notify).toBe("always");
    const top = buildFromTemplate(SEARCH_TEMPLATES.find((t) => t.id === "top_matches")!, input);
    expect(top.workflow.config.minMatchThreshold).toBe(85);
    const weekday = buildFromTemplate(SEARCH_TEMPLATES[0], { ...input, role: { id: "r1", title: "IAM Director" } });
    expect(weekday.schedule).toMatchObject({ frequency: "weekdays", days: [1, 2, 3, 4, 5], name: "Weekday shortlist — IAM Director: iam director" });
    expect(Date.parse(weekday.schedule.nextRunAt!)).toBeGreaterThan(input.now.getTime());
  });

  it("recognises the cadences it offers for changing a search in place", () => {
    for (const c of CADENCES) expect(cadenceId(c.cadence)).toBe(c.id);
    expect(cadenceId({ frequency: "monthly", days: [1], time: "09:00" })).toBeUndefined();
  });
});
