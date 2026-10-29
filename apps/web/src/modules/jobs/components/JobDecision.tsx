import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import type { JobDecision as Decision } from "@/domain/jobs/decision";
import { cn } from "@/lib/cn";

/**
 * "Why Wonder surfaced this / Things to consider / Wonder's next suggestion" — from
 * `describeDecision`, i.e. the job's real match reasons and quality signals only.
 */
export function JobDecision({ decision, variant = "card", className }: { decision: Decision; variant?: "card" | "detail"; className?: string }) {
  const detail = variant === "detail";
  const why = detail ? decision.why : decision.why.slice(0, 3);
  const consider = detail ? decision.consider : decision.consider.slice(0, 2);
  return (
    <div className={cn(detail ? "grid gap-4 sm:grid-cols-2" : "flex flex-col gap-2.5", className)}>
      {why.length > 0 && (
        <div>
          <p className={cn("font-semibold text-ink-2", detail ? "text-[13px]" : "text-[11px] uppercase tracking-wide")}>{detail ? "Why Wonder thinks this fits" : "Why Wonder surfaced this"}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {why.map((w) => (
              <li key={w} className={cn("flex items-start gap-1.5 text-ink-2", detail ? "text-[13px]" : "text-[12px]")}>
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {consider.length > 0 && (
        <div>
          <p className={cn("font-semibold text-ink-2", detail ? "text-[13px]" : "text-[11px] uppercase tracking-wide")}>{detail ? "Why you might hesitate" : "Things to consider"}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {consider.map((c) => (
              <li key={c} className={cn("flex items-start gap-1.5 text-ink-2", detail ? "text-[13px]" : "text-[12px]")}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!detail && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Lightbulb className="size-3.5 shrink-0 text-brand-600" aria-hidden />
          <span>
            Wonder&apos;s next suggestion: <span className="font-medium text-ink-2">{decision.next.label}</span>
          </span>
        </p>
      )}
    </div>
  );
}
