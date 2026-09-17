import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-bg-soft text-ink-2",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-100 text-success-600",
  warning: "bg-warning-100 text-warning-600",
  danger: "bg-danger-100 text-danger-600",
  info: "bg-info-100 text-info-600",
};

export function Badge({ tone = "neutral", icon, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none", tones[tone], className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}

/** Status dot + label; never color-only. */
export function StatusPill({ tone = "neutral", label, pulse, className }: { tone?: Tone; label: string; pulse?: boolean; className?: string }) {
  const dot: Record<Tone, string> = { neutral: "bg-ink-4", brand: "bg-brand-500", success: "bg-success-600", warning: "bg-warning-600", danger: "bg-danger-600", info: "bg-info-600" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)}>
      <span className={cn("size-1.5 rounded-full", dot[tone], pulse && "wj-animate-pulse-dot")} aria-hidden />
      {label}
    </span>
  );
}
