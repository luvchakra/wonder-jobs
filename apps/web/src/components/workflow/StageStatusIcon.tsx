import { AlertTriangle, Check, CircleDashed, Loader2, Pause, Square, UserRound, X } from "lucide-react";
import type { StageStatus } from "@/domain/workflow/status";
import { cn } from "@/lib/cn";

/** Icon + color per stage status. Never color-only: the icon shape changes with state. */
export function StageStatusIcon({ status, size = "md", className }: { status: StageStatus; size?: "sm" | "md" | "lg"; className?: string }) {
  const dim = { sm: "size-5", md: "size-6", lg: "size-8" }[size];
  const icon = { sm: "size-3", md: "size-3.5", lg: "size-4" }[size];
  const base = cn("inline-flex shrink-0 items-center justify-center rounded-full border-2", dim, className);
  switch (status) {
    case "COMPLETED":
      return (
        <span className={cn(base, "border-brand-500 bg-brand-500 text-white")} aria-hidden>
          <Check className={icon} strokeWidth={3} />
        </span>
      );
    case "COMPLETED_WITH_WARNINGS":
      return (
        <span className={cn(base, "border-warning-600 bg-warning-100 text-warning-600")} aria-hidden>
          <AlertTriangle className={icon} strokeWidth={2.5} />
        </span>
      );
    case "RUNNING":
    case "STOPPING":
      return (
        <span className={cn(base, "border-brand-500 bg-surface text-brand-600")} aria-hidden>
          <Loader2 className={cn(icon, "wj-animate-spin")} strokeWidth={3} />
        </span>
      );
    case "WAITING_FOR_USER":
      return (
        <span className={cn(base, "border-info-600 bg-info-100 text-info-600")} aria-hidden>
          <UserRound className={icon} strokeWidth={2.5} />
        </span>
      );
    case "PAUSED":
      return (
        <span className={cn(base, "border-warning-600 bg-surface text-warning-600")} aria-hidden>
          <Pause className={icon} strokeWidth={3} />
        </span>
      );
    case "STOPPED":
      return (
        <span className={cn(base, "border-ink-3 bg-surface text-ink-3")} aria-hidden>
          <Square className={icon} strokeWidth={3} />
        </span>
      );
    case "FAILED":
      return (
        <span className={cn(base, "border-danger-600 bg-danger-100 text-danger-600")} aria-hidden>
          <X className={icon} strokeWidth={3} />
        </span>
      );
    case "CANCELLED":
      return (
        <span className={cn(base, "border-line-strong bg-surface text-ink-4")} aria-hidden>
          <X className={icon} strokeWidth={2.5} />
        </span>
      );
    default:
      return (
        <span className={cn(base, "border-line-strong bg-surface text-ink-4")} aria-hidden>
          <CircleDashed className={icon} />
        </span>
      );
  }
}
