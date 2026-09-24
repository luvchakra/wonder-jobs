import type { WorkflowRun, WorkflowStageRun } from "@/domain/workflow/types";
import { APPLY_STEPS, FIND_STEPS, type ExperienceStep } from "./outcomes";

export type StepState = "done" | "active" | "waiting" | "failed" | "not_reached" | "pending";

export interface ProgressStep {
  id: string;
  label: string;
  state: StepState;
  /** A real count or note from the stage, never a made-up figure. */
  detail?: string;
}

export interface FindProgress {
  findSteps: ProgressStep[];
  applySteps: ProgressStep[];
  /** Real postings discovered so far; null until the search stage has produced a count. */
  foundSoFar: number | null;
  /** How many sources were asked, from the run's own config. */
  sourceCount: number;
}

const DONE = new Set(["COMPLETED", "COMPLETED_WITH_WARNINGS"]);
const ACTIVE = new Set(["RUNNING", "STOPPING"]);
const n = (v: number) => v.toLocaleString("en-IN");

function stepState(stages: WorkflowStageRun[], runStatus: WorkflowRun["status"]): StepState {
  if (stages.some((s) => s.status === "FAILED")) return "failed";
  if (stages.some((s) => s.status === "WAITING_FOR_USER")) return "waiting";
  if (stages.some((s) => ACTIVE.has(s.status) || s.status === "PAUSED")) return "active";
  if (stages.every((s) => DONE.has(s.status))) return "done";
  if (stages.some((s) => s.status === "CANCELLED") || runStatus === "STOPPED" || runStatus === "CANCELLED" || runStatus === "FAILED") return "not_reached";
  return "pending";
}

function detailFor(step: ExperienceStep, stages: WorkflowStageRun[]): string | undefined {
  const by = (k: string) => stages.find((s) => s.key === k);
  switch (step.id) {
    case "search": {
      const s = by("search");
      const found = s?.counts.discovered ?? (s && s.status !== "PENDING" ? s.progress.current : undefined);
      return found ? `${n(found)} found` : undefined;
    }
    case "dedupe": {
      const d = by("dedupe")?.counts.duplicates;
      return d != null && DONE.has(by("dedupe")!.status) ? `${n(d)} removed` : undefined;
    }
    case "compare": {
      const m = by("match");
      return m && stages.every((s) => DONE.has(s.status)) && m.counts.strong != null ? `${n(m.counts.strong)} strong` : undefined;
    }
    case "prepare": {
      const p = by("prepare")?.counts.prepared;
      return p ? `${n(p)} ready` : undefined;
    }
    case "handoff": {
      const h = by("apply")?.counts.handed_off;
      return h ? `${n(h)} opened` : undefined;
    }
    default:
      return undefined;
  }
}

function toSteps(defs: ExperienceStep[], run: WorkflowRun): ProgressStep[] {
  const out: ProgressStep[] = [];
  for (const def of defs) {
    // A step only exists if the run actually includes one of its stages — no phantom steps.
    const stages = run.stages.filter((s) => def.stages.includes(s.key));
    if (!stages.length) continue;
    out.push({ id: def.id, label: def.label, state: stepState(stages, run.status), detail: detailFor(def, stages) });
  }
  return out;
}

/**
 * Plain-language progress for a run, read straight from engine stage status. A step is "done"
 * only when every stage behind it completed — the view can never run ahead of the engine.
 */
export function describeFindProgress(run: WorkflowRun): FindProgress {
  const search = run.stages.find((s) => s.key === "search");
  const foundSoFar = search && search.status !== "PENDING" ? (search.counts.discovered ?? search.progress.current) : null;
  return { findSteps: toSteps(FIND_STEPS, run), applySteps: toSteps(APPLY_STEPS, run), foundSoFar, sourceCount: run.config.sourceIds.length };
}

export interface FitBreakdown {
  total: number;
  strong: number;
  worthConsidering: number;
  other: number;
  /** Null when there's no earlier finished search with a real job list to compare against. */
  newSinceLast: number | null;
}

function jobIdsOf(run: WorkflowRun): string[] | null {
  const ids = (run.outputs.dedupe?.data.jobIds ?? run.outputs.rank?.data.rankedJobIds) as string[] | undefined;
  return Array.isArray(ids) ? ids : null;
}

/**
 * The finished search in the candidate's terms: how many opportunities, split by fit. Counts come
 * from the match stage (every retained job gets a fit), falling back to the rank stage's own counts
 * for older records — never estimated.
 */
export function describeFitBreakdown(run: WorkflowRun, previous?: WorkflowRun): FitBreakdown {
  const match = run.stages.find((s) => s.key === "match");
  const rank = run.stages.find((s) => s.key === "rank");
  const total = run.summary.jobsRetained || run.summary.jobsDiscovered;
  const strong = match?.counts.strong ?? rank?.counts.strong_matches ?? run.summary.strongMatches;
  const worthConsidering = match?.counts.worth_considering ?? rank?.counts.worth_considering ?? 0;
  const other = Math.max(0, total - strong - worthConsidering);

  let newSinceLast: number | null = null;
  const mine = jobIdsOf(run);
  const theirs = previous ? jobIdsOf(previous) : null;
  if (mine && theirs) {
    const seen = new Set(theirs);
    newSinceLast = mine.filter((id) => !seen.has(id)).length;
  }
  return { total, strong, worthConsidering, other, newSinceLast };
}
