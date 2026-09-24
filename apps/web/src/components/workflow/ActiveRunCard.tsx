"use client";
import { Search, Square } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { describeRun } from "@/domain/experience/orchestrator";
import { CANDIDATE_STATUS_LABEL } from "@/domain/experience/outcomes";
import { getWorkflowService } from "@/services/workflow/service";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { toast } from "@/components/feedback/Toast";

/**
 * Home's view of Wonder's current work, in outcome terms: what it's doing, what it's found so far,
 * and the one control that matters now. The stage timeline lives on the search page's "See how
 * Wonder worked", not here.
 */
export function ActiveRunCard({ run, className }: { run?: WorkflowRun; className?: string }) {
  if (!run) {
    return (
      <Card className={className}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Search className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink">Find opportunities</h2>
            <p className="text-[13px] text-ink-3">Tell Wonder what you&apos;re looking for. It searches, compares and prepares — you decide.</p>
          </div>
          <Button href="/app/runs/new" icon={<Search className="size-4" aria-hidden />}>
            Find opportunities
          </Button>
        </div>
      </Card>
    );
  }
  const e = describeRun(run);
  const step = [...e.progress.findSteps, ...e.progress.applySteps].find((s) => s.state === "active" || s.state === "waiting");
  const done = e.progress.findSteps.filter((s) => s.state === "done").length;
  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Search className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold text-ink">{e.title}</h2>
            <Badge tone={run.status === "WAITING_FOR_USER" ? "info" : run.status === "PAUSED" ? "warning" : "brand"}>{CANDIDATE_STATUS_LABEL[run.status]}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{e.summary}</p>
          {step && run.status === "RUNNING" && (
            <p className="mt-1 text-[12px] text-ink-3" aria-live="polite">
              {step.label} · step {Math.min(done + 1, e.progress.findSteps.length)} of {e.progress.findSteps.length}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button size="sm" href={`/app/runs/${run.id}`} variant={run.status === "WAITING_FOR_USER" || run.status === "PAUSED" ? "primary" : "outline"}>
            {run.status === "WAITING_FOR_USER" ? "Review" : run.status === "PAUSED" ? "Continue" : "See progress"}
          </Button>
          {run.status === "RUNNING" && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Square className="size-3.5" aria-hidden />}
              onClick={() => {
                try {
                  getWorkflowService().stop(run.id);
                  toast.info("Stopping", "Wonder is finishing the current step. Everything found so far is kept.");
                } catch (err) {
                  toast.error("Couldn't stop", err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Stop
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
