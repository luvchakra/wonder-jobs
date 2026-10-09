"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { runningRuns } from "@/domain/workflow/running";
import { useWorkflowStore } from "@/store/workflow";
import { RunProgress } from "@/components/workflow/RunProgress";

/** Everything Wonder is running right now, from anywhere in the app. Shown only while something runs. */
export function RunningIndicator() {
  const runs = useWorkflowStore((s) => s.runs);
  const running = useMemo(() => runningRuns(runs), [runs]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!running.length) return null;
  const label = running.length === 1 ? "Searching" : `${running.length} running`;
  return (
    <div className="md:relative" ref={ref}>
      <button type="button" aria-expanded={open} aria-label={`${label} — show what's running`} onClick={() => setOpen((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-100">
        <Loader2 className="size-4 wj-animate-spin" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Running now" className="absolute inset-x-3 top-[calc(100%+0.25rem)] z-50 flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-3 shadow-lg wj-animate-fade-up md:inset-x-auto md:right-0 md:top-11 md:w-[360px]">
          <p className="px-1 text-[15px] font-semibold text-ink">Running now</p>
          {running.map((r) => (
            <RunProgress key={r.id} run={r} title={r.workflowName} onWatch={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}
