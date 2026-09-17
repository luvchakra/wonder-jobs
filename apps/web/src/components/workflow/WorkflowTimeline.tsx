"use client";
import { STAGES } from "@/domain/workflow/stages";
import { STATUS_META } from "@/domain/workflow/status";
import type { WorkflowRun, WorkflowStageRun } from "@/domain/workflow/types";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { StageStatusIcon } from "./StageStatusIcon";

/** One line describing a stage's live state, e.g. "1,842 jobs" or "743 / 1,124". */
export function stageStatusLine(stage: WorkflowStageRun): string {
  const def = STAGES[stage.key];
  const { current, total } = stage.progress;
  if (stage.status === "PENDING") return "";
  if (stage.status === "CANCELLED") return "Skipped";
  if (stage.status === "WAITING_FOR_USER") return "Waiting for you";
  if (stage.status === "PAUSED") return "Paused";
  if (stage.status === "FAILED") return stage.error?.message ?? "Failed";
  if (stage.key === "search") return `${formatNumber(stage.counts.discovered ?? current)} jobs`;
  if (stage.key === "dedupe" && (stage.status === "COMPLETED" || stage.status === "COMPLETED_WITH_WARNINGS")) return `${formatNumber(stage.counts.unique ?? 0)} unique`;
  if (stage.key === "rank" && stage.status !== "RUNNING") return `${formatNumber(stage.counts.strong_matches ?? 0)} strong`;
  if (stage.key === "prepare" && stage.status !== "RUNNING") return `${formatNumber(stage.counts.prepared ?? current)} prepared`;
  if (stage.key === "apply" && stage.status !== "RUNNING") return `${formatNumber(stage.counts.submitted ?? 0)} submitted`;
  if (total != null && total > 0) return `${formatNumber(current)} / ${formatNumber(total)}`;
  if (current > 0) return `${formatNumber(current)} ${def.unit ?? ""}`.trim();
  return STATUS_META[stage.status].label;
}

/**
 * Shared workflow timeline used by mobile, desktop and the home card
 * (spec §41: no duplicated rendering). `variant="horizontal"` is the compact
 * dashboard strip; `vertical` is the full run view.
 */
export function WorkflowTimeline({ run, variant = "vertical", limit, className, onSelectStage, selectedStage }: { run: WorkflowRun; variant?: "vertical" | "horizontal"; limit?: number; className?: string; onSelectStage?: (key: WorkflowStageRun["key"]) => void; selectedStage?: WorkflowStageRun["key"] }) {
  const stages = limit ? run.stages.slice(0, limit) : run.stages;
  if (variant === "horizontal") {
    return (
      <ol className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="Workflow stages">
        {stages.map((s, i) => {
          const done = s.status === "COMPLETED" || s.status === "COMPLETED_WITH_WARNINGS";
          const active = s.status === "RUNNING" || s.status === "WAITING_FOR_USER" || s.status === "PAUSED" || s.status === "STOPPING";
          return (
            <li key={s.id} className="min-w-0">
              <div className="flex items-center">
                <StageStatusIcon status={s.status} size="sm" />
                {i < stages.length - 1 && <span className={cn("ml-1.5 h-0.5 flex-1 rounded-full", done ? "bg-brand-500" : "bg-line")} aria-hidden />}
              </div>
              <p className={cn("mt-2 truncate text-[12px] font-medium", active ? "text-brand-700" : done ? "text-ink" : "text-ink-3")}>{STAGES[s.key].name.replace("Understanding opportunities", "Analyze Jobs").replace("Matching with your career goals", "Match & Rank")}</p>
              <p className="truncate text-[11px] text-ink-3" aria-live={active ? "polite" : undefined}>
                {stageStatusLine(s)}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className={cn("relative", className)} aria-label="Workflow stages">
      {stages.map((s, i) => {
        const def = STAGES[s.key];
        const active = s.status === "RUNNING" || s.status === "WAITING_FOR_USER" || s.status === "PAUSED" || s.status === "STOPPING";
        const done = s.status === "COMPLETED" || s.status === "COMPLETED_WITH_WARNINGS";
        const pct = s.progress.total ? Math.min(100, Math.round((s.progress.current / s.progress.total) * 100)) : null;
        const selectable = !!onSelectStage;
        const Row = selectable ? "button" : "div";
        return (
          <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < stages.length - 1 && <span className={cn("absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5", done ? "bg-brand-500" : "bg-line")} aria-hidden />}
            <StageStatusIcon status={s.status} size="sm" className="relative z-10 mt-0.5" />
            <Row
              type={selectable ? "button" : undefined}
              onClick={selectable ? () => onSelectStage?.(s.key) : undefined}
              aria-pressed={selectable ? selectedStage === s.key : undefined}
              className={cn("min-w-0 flex-1 rounded-[12px] text-left", selectable && "-m-1.5 p-1.5 transition-colors hover:bg-bg-soft", selectedStage === s.key && "bg-brand-50/70")}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn("text-[14px] font-medium", active ? "text-brand-700" : done ? "text-ink" : s.status === "FAILED" ? "text-danger-600" : "text-ink-3")}>{def.name}</p>
                <p className="shrink-0 text-[12px] text-ink-3" aria-live={active ? "polite" : undefined}>
                  {stageStatusLine(s)}
                </p>
              </div>
              {active && pct != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${def.name} progress`}>
                  <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
              )}
              {s.status === "WAITING_FOR_USER" && s.waitingReason && <p className="mt-1 text-[12px] text-info-600">{s.waitingReason}</p>}
              {s.warnings.length > 0 && <p className="mt-1 text-[12px] text-warning-600">{s.warnings[0]}</p>}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}
