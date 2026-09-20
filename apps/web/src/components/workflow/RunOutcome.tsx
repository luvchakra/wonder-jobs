"use client";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { describeOutcome } from "@/domain/workflow/outcome";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";

const TONE = {
  success: { box: "border-success-600/20 bg-success-100/60", icon: "text-success-600", Icon: CheckCircle2 },
  warning: { box: "border-warning-600/20 bg-warning-100/60", icon: "text-warning-600", Icon: AlertTriangle },
  info: { box: "border-info-600/20 bg-info-100/60", icon: "text-info-600", Icon: Info },
} as const;

/** The plain-words summary of a finished run and the next thing to do — shown above the stage timeline. */
export function RunOutcome({ run, onShowResults, className }: { run: WorkflowRun; onShowResults: () => void; className?: string }) {
  const outcome = describeOutcome(run);
  if (!outcome) return null;
  const tone = TONE[outcome.tone];
  return (
    <section aria-labelledby="run-outcome-title" className={cn("rounded-[20px] border p-5", tone.box, className)}>
      <div className="flex items-start gap-3">
        <tone.Icon className={cn("mt-0.5 size-5 shrink-0", tone.icon)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="wj-eyebrow text-[11px]">{outcome.eyebrow}</p>
          <h2 id="run-outcome-title" className="mt-1 text-[17px] font-semibold leading-snug text-ink">
            {outcome.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{outcome.body}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {outcome.actions.map((a) =>
              a.href ? (
                <Button key={a.label} href={a.href} size="sm" variant={a.primary ? "primary" : "outline"} className="w-full sm:w-auto">
                  {a.label}
                </Button>
              ) : (
                <Button key={a.label} size="sm" variant={a.primary ? "primary" : "outline"} className="w-full sm:w-auto" onClick={onShowResults}>
                  {a.label}
                </Button>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
