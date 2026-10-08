import { describe, expect, it } from "vitest";
import type { WorkflowSchedule } from "@/domain/workflow/types";
import { hasDueSchedule } from "./dueTenants";

const s = { id: "sch-1", enabled: true, trigger: "schedule", nextRunAt: "2026-04-15T02:30:00.000Z" } as WorkflowSchedule;

describe("hasDueSchedule", () => {
  it("finds a schedule due within the early window only when one is given", () => {
    const wake = new Date("2026-04-15T02:19:58.000Z");
    expect(hasDueSchedule({ [s.id]: s }, wake)).toBe(false);
    expect(hasDueSchedule({ [s.id]: s }, wake, 60 * 60_000)).toBe(true);
    expect(hasDueSchedule(undefined, wake, 60 * 60_000)).toBe(false);
  });
});
