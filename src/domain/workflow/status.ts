/**
 * Workflow state machine (spec §43).
 * Both runs and stages use the same vocabulary; transitions are explicit and
 * anything not listed here is rejected.
 */
export const RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "WAITING_FOR_USER",
  "PAUSED",
  "STOPPING",
  "STOPPED",
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];
export type StageStatus = RunStatus;

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING_FOR_USER", "PAUSED", "STOPPING", "FAILED", "COMPLETED", "COMPLETED_WITH_WARNINGS"],
  WAITING_FOR_USER: ["RUNNING", "STOPPING", "CANCELLED"],
  PAUSED: ["RUNNING", "STOPPING"],
  STOPPING: ["STOPPED"],
  STOPPED: [],
  COMPLETED: [],
  COMPLETED_WITH_WARNINGS: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly RunStatus[] = ["STOPPED", "COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "CANCELLED"];

export function canTransition(from: RunStatus, to: RunStatus) {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public readonly from: RunStatus, public readonly to: RunStatus, scope = "run") {
    super(`Invalid ${scope} transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: RunStatus, to: RunStatus, scope = "run") {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to, scope);
  return to;
}

export function isTerminal(status: RunStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export function isActive(status: RunStatus) {
  return status === "RUNNING" || status === "WAITING_FOR_USER" || status === "PAUSED" || status === "STOPPING";
}

/** Human label + tone; tone never carries meaning alone (an icon/label always accompanies it). */
export const STATUS_META: Record<RunStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  RUNNING: { label: "Running", tone: "brand" },
  WAITING_FOR_USER: { label: "Waiting for you", tone: "info" },
  PAUSED: { label: "Paused", tone: "warning" },
  STOPPING: { label: "Stopping", tone: "warning" },
  STOPPED: { label: "Stopped", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "success" },
  COMPLETED_WITH_WARNINGS: { label: "Completed with warnings", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
