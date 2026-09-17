"use client";
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Accessible tab list (roving tabindex). Panels are rendered by the parent. */
export function Tabs<T extends string>({ value, onChange, items, label, className, variant = "pill" }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; label: string; className?: string; variant?: "pill" | "underline" }) {
  const id = useId();
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = items[(idx + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.value);
    (document.getElementById(`${id}-${next.value}`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-center gap-1 overflow-x-auto wj-scrollbar-none", variant === "underline" && "border-b border-line", className)}>
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            id={`${id}-${t.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 text-[13px] font-medium transition-colors",
              variant === "pill" ? cn("rounded-full px-3.5", active ? "bg-brand-500 text-white" : "bg-surface border border-line text-ink-2 hover:text-ink") : cn("-mb-px border-b-2 px-3", active ? "border-brand-500 text-brand-700" : "border-transparent text-ink-3 hover:text-ink"),
            )}
          >
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px]", active && variant === "pill" ? "bg-white/20" : "bg-bg-soft text-ink-3")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
