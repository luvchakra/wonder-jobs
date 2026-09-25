"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Minus, UserRound, X } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { describeRun, type ExperienceResult, type NextAction } from "@/domain/experience/orchestrator";
import type { ProgressStep } from "@/domain/experience/find";
import { isTerminal } from "@/domain/workflow/status";
import { getWorkflowService } from "@/services/workflow/service";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";

const TONE: Record<ExperienceResult["tone"], string> = {
  success: "border-success-600/20 bg-success-100/50",
  info: "border-line bg-surface",
  warning: "border-warning-600/20 bg-warning-100/50",
  danger: "border-danger-600/20 bg-danger-100/50",
};

function StepIcon({ state }: { state: ProgressStep["state"] }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "bg-success-600 text-white")}>
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </span>
      );
    case "active":
      return (
        <span className={cn(base, "border-2 border-brand-500 text-brand-600")}>
          <Loader2 className="size-3 wj-animate-spin" strokeWidth={3} aria-hidden />
        </span>
      );
    case "waiting":
      return (
        <span className={cn(base, "bg-info-100 text-info-600")}>
          <UserRound className="size-3" strokeWidth={3} aria-hidden />
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-danger-100 text-danger-600")}>
          <X className="size-3" strokeWidth={3} aria-hidden />
        </span>
      );
    case "not_reached":
      return (
        <span className={cn(base, "bg-bg-soft text-ink-4")}>
          <Minus className="size-3" strokeWidth={3} aria-hidden />
        </span>
      );
    default:
      return <span className={cn(base, "border-2 border-line-strong")} aria-hidden />;
  }
}

const STEP_STATE_TEXT: Record<ProgressStep["state"], string> = { done: "done", active: "in progress", waiting: "needs you", failed: "didn't finish", not_reached: "not reached", pending: "not started" };

function Steps({ steps, label }: { steps: ProgressStep[]; label: string }) {
  if (!steps.length) return null;
  return (
    <ol className="flex flex-col gap-2.5" aria-label={label}>
      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-3 text-[14px]">
          <StepIcon state={s.state} />
          <span className={cn("min-w-0 flex-1", s.state === "active" ? "font-medium text-ink" : s.state === "pending" || s.state === "not_reached" ? "text-ink-3" : "text-ink-2")}>
            {s.label}
            <span className="wj-sr-only"> — {STEP_STATE_TEXT[s.state]}</span>
          </span>
          {s.detail && <span className="shrink-0 text-[12px] text-ink-3">{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * The candidate-facing view of a run: what Wonder did, what it found, what it needs, what's next.
 * Everything comes from `describeRun` over the live run; controls call the workflow service directly
 * (the same calls the technical controls make), so there is no second copy of any state.
 */
export function RunExperience({ run, previous, onShowResults, className }: { run: WorkflowRun; previous?: WorkflowRun; onShowResults: () => void; className?: string }) {
  const router = useRouter();
  const e = describeRun(run, previous);
  const svc = getWorkflowService();
  const terminal = isTerminal(run.status);
  const searchAgainHref = `/app/runs/new?q=${encodeURIComponent(run.config.careerGoal)}`;
  const canRecheck = terminal && run.status !== "CANCELLED" && run.stages.some((s) => s.key === "match") && run.stages.some((s) => s.key === "search" && (s.status === "COMPLETED" || s.status === "COMPLETED_WITH_WARNINGS"));

  const control = (fn: () => void, fail: string) => {
    try {
      fn();
    } catch (err) {
      toast.error(fail, err instanceof Error ? err.message : undefined);
    }
  };
  const recheck = () =>
    control(() => {
      // Reuses what was already found and re-compares it with the current Career Profile;
      // rerunFrom shares the idempotency ledger, so no external action can repeat.
      const child = svc.rerunFrom(run.id, "match");
      toast.success("Rechecking these opportunities", "Using what Wonder already found, compared with your current Career Profile.");
      router.push(`/app/runs/${child.id}`);
    }, "Couldn't recheck");

  const actions: NextAction[] = e.nextActions.map((a) => (a.href === "/app/runs/new" ? { ...a, href: searchAgainHref } : a));
  if (terminal && !actions.some((a) => a.href === searchAgainHref)) actions.push({ label: "Search again", href: searchAgainHref });

  const run_ = (a: NextAction) => {
    switch (a.kind) {
      case "pause":
        return control(() => svc.pause(run.id), "Couldn't pause");
      case "resume":
        return control(() => svc.resume(run.id), "Couldn't continue");
      case "continue":
        return control(() => svc.continue(run.id), "Couldn't continue");
      case "stop":
        return control(() => {
          svc.stop(run.id);
          toast.info("Stopping", "Wonder is finishing the current step. Everything found so far is kept.");
        }, "Couldn't stop");
      default:
        if (a.showResults) onShowResults();
    }
  };

  const b = e.breakdown;
  return (
    <section aria-labelledby="run-experience-title" className={cn("rounded-[20px] border p-5", TONE[e.tone], className)}>
      <p className="wj-eyebrow text-[11px]">{e.eyebrow}</p>
      <h2 id="run-experience-title" className="mt-1 flex items-center gap-2 text-[19px] font-semibold leading-snug text-ink">
        {e.state === "failed" && <AlertTriangle className="size-5 text-danger-600" aria-hidden />}
        {e.title}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2" aria-live={terminal ? undefined : "polite"}>
        {e.summary}
      </p>

      {b && b.total > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="What Wonder found">
          <li>
            <Link href="/app/jobs?fit=strong" className="block rounded-[14px] bg-surface p-3 hover:bg-bg-soft">
              <span className="block text-[20px] font-semibold text-ink">{b.strong.toLocaleString("en-IN")}</span>
              <span className="text-[12px] text-ink-3">Strong opportunities</span>
            </Link>
          </li>
          <li>
            <Link href="/app/jobs?fit=worth_considering" className="block rounded-[14px] bg-surface p-3 hover:bg-bg-soft">
              <span className="block text-[20px] font-semibold text-ink">{b.worthConsidering.toLocaleString("en-IN")}</span>
              <span className="text-[12px] text-ink-3">Worth considering</span>
            </Link>
          </li>
          <li>
            <Link href="/app/jobs" className="block rounded-[14px] bg-surface p-3 hover:bg-bg-soft">
              <span className="block text-[20px] font-semibold text-ink">{b.other.toLocaleString("en-IN")}</span>
              <span className="text-[12px] text-ink-3">Other results</span>
            </Link>
          </li>
          {b.newSinceLast != null && (
            <li className="rounded-[14px] bg-surface p-3">
              <span className="block text-[20px] font-semibold text-ink">{b.newSinceLast.toLocaleString("en-IN")}</span>
              <span className="text-[12px] text-ink-3">New since your last search</span>
            </li>
          )}
        </ul>
      )}

      {!terminal && (
        <div className="mt-5 flex flex-col gap-4">
          <Steps steps={e.progress.findSteps} label="Finding opportunities" />
          {e.progress.applySteps.length > 0 && (
            <div className="border-t border-line pt-4">
              <Steps steps={e.progress.applySteps} label="Preparing applications" />
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.map((a) =>
          a.href && !a.kind ? (
            <Button key={a.label} href={a.href} size="sm" variant={a.primary ? "primary" : "outline"} className="w-full sm:w-auto">
              {a.label}
            </Button>
          ) : (
            <Button key={a.label} size="sm" variant={a.primary ? "primary" : a.kind === "stop" ? "ghost" : "outline"} className="w-full sm:w-auto" disabled={run.status === "STOPPING"} onClick={() => (a.href ? router.push(a.href) : run_(a))}>
              {a.label}
            </Button>
          ),
        )}
        {canRecheck && (
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={recheck}>
            Recheck these opportunities
          </Button>
        )}
      </div>
    </section>
  );
}
