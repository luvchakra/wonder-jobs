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

  it("a 'running' copy synced in after this page loaded (another tab, an earlier session) doesn't block new searches", () => {
    const svc = getWorkflowService();
    // The engine has already loaded the store (above); now a copy of another session's run arrives, still RUNNING.
    useWorkflowStore.setState((s) => ({ runs: { ...s.runs, run_synced: { ...(leftRunning as object), id: "run_synced", status: "RUNNING" } as never } }));
    expect(selectActiveRun(useWorkflowStore.getState())?.id).toBe("run_synced");
    // Nothing on this page drives it: it's recorded as stopped, as a reload would, and no longer counts as active.
    expect(svc.hasActiveRun()).toBe(false);
    expect(useWorkflowStore.getState().runs.run_synced.status).toBe("STOPPED");
    // A server-run (scheduled) one is left alone.
    useWorkflowStore.setState((s) => ({ runs: { ...s.runs, run_server: { ...(leftRunning as object), id: "run_server", trigger: "schedule", status: "RUNNING" } as never } }));
    expect(svc.hasActiveRun()).toBe(true);
    expect(useWorkflowStore.getState().runs.run_server.status).toBe("RUNNING");
  });
});
