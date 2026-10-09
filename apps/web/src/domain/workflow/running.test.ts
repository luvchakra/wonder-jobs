import { describe, expect, it } from "vitest";
import type { WorkflowRun } from "./types";
import { runningRuns, runProgress } from "./running";

const stage = (key: string, status: string, current = 0, total: number | null = null) => ({ key, status, progress: { current, total, unit: "jobs" } });
const run = (id: string, status: string, createdAt: string, extra: Partial<WorkflowRun> = {}) => ({ id, status, createdAt, stages: [], ...extra }) as unknown as WorkflowRun;

describe("what's running", () => {
  it("lists runs that are going on, newest first, and nothing finished", () => {
    const runs = { a: run("a", "RUNNING", "2026-10-09T10:00:00Z"), b: run("b", "COMPLETED", "2026-10-09T11:00:00Z"), c: run("c", "PENDING", "2026-10-09T12:00:00Z"), d: run("d", "WAITING_FOR_USER", "2026-10-09T09:00:00Z") };
    expect(runningRuns(runs, Date.parse("2026-10-09T12:01:00Z")).map((r) => r.id)).toEqual(["c", "a", "d"]);
    // A run created long ago and never started is a leftover, not running.
    expect(runningRuns(runs, Date.parse("2026-10-09T13:00:00Z")).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("says which step a run is on and how far through it is", () => {
    const r = run("a", "RUNNING", "", { currentStage: "search", stages: [stage("profile", "COMPLETED"), stage("search", "RUNNING", 5, 10), stage("dedupe", "PENDING"), stage("rank", "PENDING")] } as never);
    expect(runProgress(r)).toEqual({ label: "Searching job sources", fraction: (1 + 0.5) / 4 });
    expect(runProgress(run("b", "PENDING", "")).label).toBe("Starting");
    expect(runProgress(run("c", "WAITING_FOR_USER", "")).label).toBe("Waiting for you");
  });
});
