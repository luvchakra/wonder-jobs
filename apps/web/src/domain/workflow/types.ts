import type { AutomationLevel } from "@/domain/automation/policy";
import type { AIProviderId } from "@/domain/ai/types";
import type { RunStatus, StageStatus } from "./status";
import type { StageKey } from "./stages";

/** Where a value came from (spec §10). User values always win over AI values. */
export type Provenance = "AI_GENERATED" | "USER_PROVIDED" | "USER_MODIFIED" | "SYSTEM_DERIVED";

export interface WorkflowInput {
  key: string;
  label: string;
  value: unknown;
  provenance: Provenance;
  updatedAt: string;
}

export interface WorkflowOverride {
  id: string;
  stageKey: StageKey;
  key: string;
  label: string;
  value: unknown;
  previousValue?: unknown;
  provenance: Extract<Provenance, "USER_PROVIDED" | "USER_MODIFIED">;
  createdAt: string;
}

export interface WorkflowOutput {
  stageKey: StageKey;
  /** Stage-specific structured payload. Executors define the shape. */
  data: Record<string, unknown>;
  provenance: Provenance;
  producedAt: string;
  /** Present when the output was copied from a parent run during a rerun. */
  inheritedFromRunId?: string;
}

export type ErrorCategory = "recoverable" | "partial" | "user_action_required" | "fatal";
export type ErrorAction = "retry" | "continue" | "fix_config" | "change_provider" | "stop";

export interface RunError {
  category: ErrorCategory;
  message: string;
  /** e.g. a job source or AI provider name */
  source?: string;
  actions: ErrorAction[];
  code?: string;
}

export interface Evidence {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export interface StageProgress {
  current: number;
  total: number | null;
  unit: string;
}

export interface WorkflowStageRun {
  id: string;
  runId: string;
  key: StageKey;
  status: StageStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  progress: StageProgress;
  counts: Record<string, number>;
  evidence: Evidence[];
  warnings: string[];
  error?: RunError;
  /** Why the stage is waiting on the user, when it is. */
  waitingReason?: string;
  inheritedFromRunId?: string;
}

export type ActionType = "submit_application" | "send_recruiter_message" | "send_email";

export interface WorkflowAction {
  id: string;
  runId: string;
  stageKey: StageKey;
  type: ActionType;
  /** Stable key: the same logical action (e.g. application X to job Y) never executes twice. */
  idempotencyKey: string;
  targetId: string;
  label: string;
  status: "pending_confirmation" | "confirmed" | "executing" | "succeeded" | "failed" | "skipped_duplicate" | "rejected";
  attempts: number;
  createdAt: string;
  executedAt?: string;
  error?: string;
  /** Audit trail entries (spec §46). */
  history: { at: string; event: string; detail?: string }[];
}

export interface RunEvent {
  id: string;
  at: string;
  type:
    | "run_created"
    | "run_started"
    | "run_paused"
    | "run_resumed"
    | "run_stopping"
    | "run_stopped"
    | "run_completed"
    | "run_failed"
    | "run_cancelled"
    | "stage_started"
    | "stage_completed"
    | "stage_failed"
    | "stage_waiting"
    | "stage_restarted"
    | "override_applied"
    | "action_confirmed"
    | "action_rejected"
    | "action_executed"
    | "action_skipped";
  stageKey?: StageKey;
  message: string;
}

export interface ProviderSnapshot {
  provider: AIProviderId;
  model?: string;
  billing: "platform" | "byok";
}

export interface RunConfig {
  careerGoal: string;
  automationLevel: AutomationLevel;
  provider: ProviderSnapshot;
  sourceIds: string[];
  searchCriteria: {
    query: string;
    locations: string[];
    workModes: ("remote" | "hybrid" | "onsite")[];
    minSalary?: number;
  };
  minMatchThreshold: number;
  maxResults: number;
  notify: "always" | "strong_matches_only" | "never";
}

export interface RunSummary {
  jobsDiscovered: number;
  jobsRetained: number;
  strongMatches: number;
  applicationsPrepared: number;
  actionsExecuted: number;
  errors: number;
  warnings: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  trigger: "manual" | "schedule";
  status: RunStatus;
  config: RunConfig;
  inputs: WorkflowInput[];
  overrides: WorkflowOverride[];
  stages: WorkflowStageRun[];
  outputs: Partial<Record<StageKey, WorkflowOutput>>;
  actions: WorkflowAction[];
  events: RunEvent[];
  currentStage?: StageKey;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: RunError;
  summary: RunSummary;
  parentRunId?: string;
  rerunFromStage?: StageKey;
  /** Set when a scheduled run finished with nothing worth reporting (spec §18). */
  silent?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: number;
  template?: string;
  config: RunConfig;
  stageKeys: StageKey[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: "schedule" | "manual" | "event";
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  days: number[]; // 0..6
  time: string; // HH:mm
  timezone: string;
  condition: { key: "strong_matches" | "new_jobs" | "always"; op: ">"; value: number };
  actions: ("notify" | "save_jobs" | "prepare_materials")[];
  lastRunAt?: string;
  lastRunId?: string;
  nextRunAt?: string;
  createdAt: string;
}
