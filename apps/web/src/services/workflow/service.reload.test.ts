import { describe, expect, it } from "vitest";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { getWorkflowService } from "./service";

/* A run the previous page left "running": persisted in the store, but no engine on this page ran it. */
const leftRunning = {
  id: "run_prev",
  workflowId: "wf_prev",
  workflowName: "Jobs for you — product generalist",
  workflowVersion: 1,
  trigger: "manual",
  status: "RUNNING",
  config: { searchCriteria: { query: "product generalist", locations: [] }, sourceIds: [] },
  stages: [{ key: "search", status: "RUNNING" }],
  events: [],
  actions: [],
  inputs: [],
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
} as never;

describe("workflow service after a reload", () => {
  it("stopping the last page's run doesn't throw, and leaves no run active, so a new search can start", () => {
    useWorkflowStore.setState({ runs: { run_prev: leftRunning } });
    expect(selectActiveRun(useWorkflowStore.getState())?.id).toBe("run_prev");
    const svc = getWorkflowService();
    // Before the fix this threw "Unknown run run_prev": the engine hadn't loaded the persisted runs yet.
    expect(() => svc.stop("run_prev")).not.toThrow();
    expect(selectActiveRun(useWorkflowStore.getState())).toBeUndefined();
    expect(useWorkflowStore.getState().runs.run_prev.status).toBe("STOPPED");
    expect(svc.hasActiveRun()).toBe(false);
    // Stopping or cancelling it again is a no-op, not an error.
    expect(() => svc.stop("run_prev")).not.toThrow();
    expect(() => svc.cancel("run_prev")).not.toThrow();
  });
});
