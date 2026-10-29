"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "How did this application go?" for every module (taken from Jobs' job page, owner, 2026-10-25): Mark as applied and
 * Mark as withdrawn, the one already marked lit. The person's own record of what they did on the other site; the module
 * decides what each mark does in its Pipeline, and nothing is sent anywhere.
 */
export function OutcomeButtons({ outcome, onMark }: { outcome: "applied" | "withdrawn" | null; onMark: (outcome: "applied" | "withdrawn") => void }) {
  const done = outcome === "applied";
  const dropped = outcome === "withdrawn";
  const btn = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border px-2 text-[12.5px] font-medium wj-press";
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="How did this application go?">
      <button type="button" aria-pressed={done} onClick={() => !done && onMark("applied")} className={cn(btn, done ? "border-success-600 bg-success-100 text-success-600" : "border-line bg-surface text-ink hover:bg-surface-2")}>
        <CheckCircle2 className="size-4" aria-hidden /> {done ? "Applied" : "Mark as applied"}
      </button>
      <button type="button" aria-pressed={dropped} onClick={() => !dropped && onMark("withdrawn")} className={cn(btn, dropped ? "border-line-strong bg-bg-soft text-ink-2" : "border-line bg-surface text-ink hover:bg-surface-2")}>
        <XCircle className="size-4" aria-hidden /> {dropped ? "Withdrawn" : "Mark as withdrawn"}
      </button>
    </div>
  );
}
