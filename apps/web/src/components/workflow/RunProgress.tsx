"use client";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { runProgress } from "@/domain/workflow/running";
import type { WorkflowRun } from "@/domain/workflow/types";
import { cn } from "@/lib/cn";

/** A run that's going on: the step it's on, how far along, and a way to watch it. Shown while it runs, gone when it ends. */
export function RunProgress({ run, title, className, onWatch }: { run: WorkflowRun; title?: string; className?: string; onWatch?: () => void }) {
  const { label, fraction } = runProgress(run);
  return (
    <div role="status" aria-live="polite" className={cn("rounded-[12px] border border-brand-200 bg-brand-50 px-3 py-2.5", className)}>
      <div className="flex items-center gap-2 text-[13px]">
        <Loader2 className="size-4 shrink-0 wj-animate-spin text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-brand-700">{title ?? "Searching now"}</span>
          <span className="text-ink-2"> · {label}</span>
        </span>
        <Link href={`/app/runs/${run.id}`} onClick={onWatch} className="shrink-0 text-[13px] font-medium text-brand-600 hover:underline">
          Watch
        </Link>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${Math.max(6, Math.round(fraction * 100))}%` }} />
      </div>
    </div>
  );
}
