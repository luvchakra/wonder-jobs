"use client";
import Link from "next/link";
import { Play, Square } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { STAGES } from "@/domain/workflow/stages";
import { getWorkflowService } from "@/services/workflow/service";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { RunStatusPill } from "./RunStatusPill";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { toast } from "@/components/feedback/Toast";

export function ActiveRunCard({ run, className }: { run?: WorkflowRun; className?: string }) {
  if (!run) {
    return (
      <Card className={className}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Play className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink">No active run</h2>
            <p className="text-[13px] text-ink-3">Tell Wonder what you want. It searches, analyzes and prepares — you stay in control.</p>
          </div>
          <Button href="/app/runs/new" icon={<Play className="size-4" aria-hidden />}>
            Run Wonder
          </Button>
        </div>
      </Card>
    );
  }
  const current = run.currentStage ? STAGES[run.currentStage] : undefined;
  const subtitle =
    run.status === "WAITING_FOR_USER"
      ? run.stages.find((s) => s.key === run.currentStage)?.waitingReason ?? "Wonder needs your input."
      : run.status === "PAUSED"
        ? "Paused — resume whenever you're ready."
        : run.status === "STOPPING"
          ? "Stopping safely. Completed work is preserved."
          : current
            ? `Searching across ${run.config.sourceIds.length} sources, analyzing opportunities and finding your best matches…`
            : "Preparing…";
  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 text-brand-600">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
            <path d="M5 12l4 4L19 6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold text-ink">Your Active Run</h2>
            <RunStatusPill status={run.status} />
          </div>
          <p className="mt-1 text-[14px] font-medium text-ink">
            <Link href={`/app/runs/${run.id}`} className="hover:underline">
              {run.workflowName}
            </Link>
          </p>
          <p className="text-[13px] text-ink-3">{subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {run.status === "WAITING_FOR_USER" ? (
            <Button size="sm" href={`/app/runs/${run.id}`}>
              Review
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              icon={<Square className="size-3.5" aria-hidden />}
              disabled={run.status === "STOPPING"}
              onClick={() => {
                getWorkflowService().stop(run.id);
                toast.info("Stopping run", "Wonder is finishing the current step safely.");
              }}
            >
              Stop
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5 hidden md:block">
        <WorkflowTimeline run={run} variant="horizontal" limit={7} />
      </div>
      <div className="mt-4 md:hidden">
        <WorkflowTimeline run={run} variant="vertical" limit={7} />
      </div>
    </Card>
  );
}
