import { isActive } from "./status";
import { STAGES } from "./stages";
import type { WorkflowRun } from "./types";

/** A run created but never started is a leftover after this long, not one about to start. */
const PENDING_FRESH_MS = 2 * 60_000;

/** Runs going on right now (started, or created moments ago and about to start), newest first. */
export function runningRuns(runs: Record<string, WorkflowRun>, now = Date.now()): WorkflowRun[] {
  return Object.values(runs)
    .filter((r) => isActive(r.status) || (r.status === "PENDING" && now - Date.parse(r.createdAt) < PENDING_FRESH_MS))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Where a run is: the step it's on in plain words, and how far through its steps it is (0–1). */
export function runProgress(run: Pick<WorkflowRun, "status" | "stages" | "currentStage">): { label: string; fraction: number } {
  const total = run.stages.length || 1;
  const done = run.stages.filter((s) => s.status === "COMPLETED" || s.status === "COMPLETED_WITH_WARNINGS").length;
  const current = run.stages.find((s) => s.key === run.currentStage);
  // Part of the current step counts too, when the step knows its total.
  const within = current?.progress.total ? Math.min(1, current.progress.current / current.progress.total) : 0;
  const label =
    run.status === "PENDING" ? "Starting" : run.status === "WAITING_FOR_USER" ? "Waiting for you" : run.status === "PAUSED" ? "Paused" : run.status === "STOPPING" ? "Stopping" : run.currentStage ? STAGES[run.currentStage].activeLabel : "Working";
  return { label, fraction: Math.min(1, (done + within) / total) };
}
