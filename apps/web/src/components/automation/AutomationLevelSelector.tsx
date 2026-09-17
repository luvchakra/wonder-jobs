"use client";
import { Check } from "lucide-react";
import { AUTOMATION_LEVELS, AUTOMATION_LEVEL_META, type AutomationLevel } from "@/domain/automation/policy";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/common/Badge";

export function AutomationLevelSelector({ value, onChange, className, compact = false }: { value: AutomationLevel; onChange: (v: AutomationLevel) => void; className?: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Automation level" className={cn("flex flex-col gap-2", className)}>
      {AUTOMATION_LEVELS.map((level) => {
        const meta = AUTOMATION_LEVEL_META[level];
        const active = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(level)}
            className={cn("flex items-center gap-3 rounded-[14px] border p-3 text-left transition-colors", active ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-100" : "border-line bg-surface hover:border-line-strong", compact && "p-2.5")}
          >
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong")} aria-hidden>
              {active && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={cn("text-[14px] font-semibold", active ? "text-brand-700" : "text-ink")}>{meta.label}</span>
                {meta.recommended && <Badge tone="brand">Recommended</Badge>}
              </span>
              <span className="block text-[12px] text-ink-3">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
