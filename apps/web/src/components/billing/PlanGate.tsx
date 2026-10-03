import Link from "next/link";
import { Lock } from "lucide-react";
import type { PlanId, PlanLimits } from "@/domain/billing/plans";
import { cn } from "@/lib/cn";

/** One line saying what a plan doesn't include and which plan does, with the one link that matters. */
export function PlanGate({ reason, needs, plans, className }: { reason: string; needs: PlanId | null; plans: Record<PlanId, PlanLimits>; className?: string }) {
  return (
    <p role="status" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] bg-warning-100/50 px-3 py-2 text-[13px] text-ink-2", className)}>
      <Lock className="size-3.5 shrink-0 text-warning-600" aria-hidden />
      <span>{reason}</span>
      {needs ? (
        <Link href="/app/profile#plan" className="font-medium text-brand-600 hover:underline">
          Included in {plans[needs].label} ›
        </Link>
      ) : (
        <span className="text-ink-3">No plan includes this yet.</span>
      )}
    </p>
  );
}
