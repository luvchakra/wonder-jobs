import type { WorkflowRun } from "@/domain/workflow/types";
import { describeOutcome, type OutcomeAction } from "@/domain/workflow/outcome";
import { isTerminal } from "@/domain/workflow/status";
import { STAGE_OUTCOME, type UserOutcome } from "./outcomes";
import { describeFindProgress, describeFitBreakdown, type FindProgress, type FitBreakdown } from "./find";

/**
 * Experience Orchestrator (spec §30). Reads a real WorkflowRun and answers the four questions every
 * screen must answer — what Wonder accomplished, what it discovered, what it needs, what's next —
 * in candidate language. It holds no state of its own and never calls the engine: controls still
 * go straight to the workflow service, so the state machine and idempotency ledger stay the only
 * source of truth.
 */
export type ExperienceState = "starting" | "working" | "needs_you" | "paused" | "stopping" | "stopped" | "cancelled" | "ready" | "failed";

export type NextActionKind = "continue" | "resume" | "pause" | "stop" | "search_again" | "recheck" | "show_results";

export interface NextAction extends OutcomeAction {
  /** An engine control the screen wires to the workflow service (instead of an href). */
  kind?: NextActionKind;
}

export interface UserIntervention {
  /** The stage's own waiting reason, verbatim — never a paraphrase that could drift from it. */
  reason: string;
  pendingApprovals: number;
}

export interface TransparencySummary {
  stagesInRun: number;
  sources: number;
  discovered: number;
  retained: number;
  warnings: number;
  errors: number;
}

export interface ExperienceResult {
  outcome: UserOutcome;
  state: ExperienceState;
  eyebrow: string;
  title: string;
  summary: string;
  tone: "success" | "info" | "warning" | "danger";
  nextActions: NextAction[];
  needsUser?: UserIntervention;
  progress: FindProgress;
  breakdown?: FitBreakdown;
  transparency: TransparencySummary;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function describeRun(run: WorkflowRun, previous?: WorkflowRun): ExperienceResult {
  const progress = describeFindProgress(run);
  const outcome: UserOutcome = run.currentStage ? STAGE_OUTCOME[run.currentStage] : isTerminal(run.status) ? "decide" : "find";
  const transparency: TransparencySummary = {
    stagesInRun: run.stages.length,
    sources: run.config.sourceIds.length,
    discovered: run.summary.jobsDiscovered,
    retained: run.summary.jobsRetained,
    warnings: run.summary.warnings,
    errors: run.summary.errors,
  };
  const base = { outcome, progress, transparency };
  const working = outcome === "apply" ? "Wonder is preparing your applications" : outcome === "progress" ? "Wonder is updating your applications" : "Wonder is finding opportunities";
  const found = progress.foundSoFar != null ? `${plural(progress.foundSoFar, "opportunity", "opportunities")} found so far.` : `Searching ${plural(progress.sourceCount, "source")}.`;
  const match = run.stages.find((s) => s.key === "match");
  const strong = match && (match.status === "COMPLETED" || match.status === "COMPLETED_WITH_WARNINGS") ? match.counts.strong : undefined;
  const retained = run.summary.jobsRetained || progress.foundSoFar || 0;
  const workingSummary =
    outcome === "apply"
      ? `Found ${plural(retained, "opportunity", "opportunities")}${strong != null ? `, ${strong.toLocaleString("en-IN")} strong` : ""}. Now preparing application packs for your top matches.`
      : outcome === "progress"
        ? "Updating your applications with what happened in this search."
        : outcome === "decide"
          ? `${found} Comparing them with your Career Profile.`
          : found;

  switch (run.status) {
    case "PENDING":
      return { ...base, state: "starting", eyebrow: "Getting ready", title: "Wonder is getting ready", summary: "Your search starts in a moment.", tone: "info", nextActions: [] };
    case "RUNNING":
      return { ...base, state: "working", eyebrow: "Working", title: working, summary: workingSummary, tone: "info", nextActions: [{ label: "Pause", kind: "pause" }, { label: "Stop", kind: "stop" }] };
    case "STOPPING":
      return { ...base, state: "stopping", eyebrow: "Stopping", title: "Stopping safely", summary: "Wonder is finishing the current step. Everything already found stays available.", tone: "info", nextActions: [] };
    case "PAUSED":
      return { ...base, state: "paused", eyebrow: "Paused", title: "Wonder is paused", summary: `Nothing is lost — ${progress.foundSoFar != null ? `${plural(progress.foundSoFar, "opportunity", "opportunities")} found so far. ` : ""}Continue whenever you're ready.`, tone: "warning", nextActions: [{ label: "Continue", kind: "resume", primary: true }, { label: "Stop", kind: "stop" }] };
    case "WAITING_FOR_USER": {
      const stage = run.stages.find((s) => s.key === run.currentStage);
      const pendingApprovals = run.actions.filter((a) => a.status === "pending_confirmation" && a.stageKey === run.currentStage).length;
      const reason = stage?.waitingReason ?? "Wonder needs a decision from you before it continues.";
      return { ...base, state: "needs_you", eyebrow: "Your input", title: "Wonder needs your input", summary: reason, tone: "info", needsUser: { reason, pendingApprovals }, nextActions: [{ label: "Continue", kind: "continue", primary: true }, { label: "Stop", kind: "stop" }] };
    }
    case "FAILED":
      // The engine fails the search stage when nothing matched — that's an empty result the candidate
      // can act on, not a breakdown, so it says so plainly and offers to change the search.
      if (run.summary.jobsDiscovered === 0 && run.error?.category === "user_action_required") {
        return {
          ...base,
          state: "failed",
          eyebrow: "Nothing found",
          title: "No jobs matched this search",
          summary: `None of the ${plural(run.config.sourceIds.length, "source")} had jobs for “${run.config.searchCriteria.query}”${run.config.searchCriteria.locations.length ? ` in ${run.config.searchCriteria.locations.join(", ")}` : ""}. Try a broader role, other locations or more sources.`,
          tone: "warning",
          nextActions: [{ label: "Change the search", kind: "search_again", href: "/app/runs/new", primary: true }],
        };
      }
      return {
        ...base,
        state: "failed",
        eyebrow: "Couldn't finish",
        title: "This search couldn't finish",
        summary: `${run.error?.message ?? "Something went wrong."} Everything Wonder found before that is still available.`,
        tone: "danger",
        nextActions: [{ label: "Search again", kind: "search_again", href: "/app/runs/new", primary: true }],
      };
    default: {
      // Terminal, non-failed: describeOutcome already owns the candidate-language result.
      const o = describeOutcome(run)!;
      const stopped = run.status === "STOPPED" || run.status === "CANCELLED";
      const breakdown = stopped ? undefined : describeFitBreakdown(run, previous);
      return {
        ...base,
        state: run.status === "CANCELLED" ? "cancelled" : stopped ? "stopped" : "ready",
        eyebrow: o.eyebrow,
        title: o.title,
        summary: o.body,
        tone: o.tone,
        nextActions: o.actions,
        breakdown,
      };
    }
  }
}

/** The most recent finished run before `run` — the baseline for "new since your last search". */
export function previousFinishedRun(run: WorkflowRun, runs: Record<string, WorkflowRun>): WorkflowRun | undefined {
  return Object.values(runs)
    .filter((r) => r.id !== run.id && (r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS") && (r.completedAt ?? r.createdAt) < (run.startedAt ?? run.createdAt))
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))[0];
}
