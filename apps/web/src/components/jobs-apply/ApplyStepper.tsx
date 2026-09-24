import { Check } from "lucide-react";
import { APPLY_STEPS, type ApplyStep } from "@/domain/jobs-apply/states";
import { cn } from "@/lib/cn";

/** Method → Sign in → Fill & review → Submit on site → Track. The last two are the candidate's own actions. */
export function ApplyStepper({ current }: { current: ApplyStep }) {
  const at = APPLY_STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-5 grid grid-cols-5 gap-1" aria-label="Application steps">
      {APPLY_STEPS.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <li key={s.key} className="flex min-w-0 flex-col items-center gap-1 text-center" aria-current={active ? "step" : undefined}>
            <span className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || active ? "bg-brand-500" : "bg-line")} />
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold", done ? "bg-brand-500 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-surface-2 text-ink-3")}>{done ? <Check className="size-4" aria-hidden /> : i + 1}</span>
              <span className={cn("h-0.5 flex-1", i === APPLY_STEPS.length - 1 ? "bg-transparent" : done ? "bg-brand-500" : "bg-line")} />
            </span>
            <span className={cn("truncate text-[11px] sm:text-[12px]", active ? "font-semibold text-brand-700" : "text-ink-3")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
