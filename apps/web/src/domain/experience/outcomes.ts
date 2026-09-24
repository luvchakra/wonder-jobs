import type { StageKey } from "@/domain/workflow/stages";
import type { RunStatus } from "@/domain/workflow/status";

/**
 * The candidate's four outcomes (spec §3) plus the invisible learning loop. The engine keeps its
 * 12 stages; this file is the one place that says which outcome each stage serves, so screens map
 * stages to outcomes by lookup, never by their own branching.
 */
export type UserOutcome = "find" | "decide" | "apply" | "progress" | "learn";

export const STAGE_OUTCOME: Record<StageKey, UserOutcome> = {
  profile: "find",
  search: "find",
  dedupe: "find",
  understand: "find",
  match: "decide",
  quality: "decide",
  rank: "decide",
  prepare: "apply",
  review: "apply",
  apply: "apply",
  track: "progress",
  learn: "learn",
};

/**
 * Candidate-facing steps shown while Wonder works, each backed by one or more contiguous engine
 * stages. `learn` has no step: learning surfaces only when it produces a real suggestion.
 */
export interface ExperienceStep {
  id: string;
  label: string;
  stages: StageKey[];
}

export const FIND_STEPS: ExperienceStep[] = [
  { id: "goals", label: "Understanding your career goals", stages: ["profile"] },
  { id: "search", label: "Searching the market", stages: ["search"] },
  { id: "dedupe", label: "Removing duplicates", stages: ["dedupe"] },
  { id: "relevance", label: "Checking relevant roles", stages: ["understand"] },
  { id: "compare", label: "Comparing opportunities with your career profile", stages: ["match", "quality"] },
  { id: "prioritize", label: "Prioritizing what deserves your attention", stages: ["rank"] },
];

export const APPLY_STEPS: ExperienceStep[] = [
  { id: "prepare", label: "Preparing application packs", stages: ["prepare"] },
  { id: "review", label: "Waiting for your review", stages: ["review"] },
  { id: "handoff", label: "Opening employer applications for you", stages: ["apply"] },
  { id: "track", label: "Updating your applications", stages: ["track"] },
];

/**
 * Short candidate-facing status labels. `STATUS_META` (domain/workflow/status.ts) stays the
 * technical vocabulary for "See how Wonder worked"; primary UX uses these.
 */
export const CANDIDATE_STATUS_LABEL: Record<RunStatus, string> = {
  PENDING: "Starting",
  RUNNING: "Working",
  WAITING_FOR_USER: "Needs your input",
  PAUSED: "Paused",
  STOPPING: "Stopping",
  STOPPED: "Stopped",
  COMPLETED: "Ready",
  COMPLETED_WITH_WARNINGS: "Ready, with notes",
  FAILED: "Couldn't finish",
  CANCELLED: "Cancelled",
};
