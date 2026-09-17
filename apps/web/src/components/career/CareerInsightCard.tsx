import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { CareerInsight } from "@/domain/career/types";
import { cn } from "@/lib/cn";

export function Sparkbars({ series, className }: { series: number[]; className?: string }) {
  const max = Math.max(...series, 1);
  return (
    <div className={cn("flex h-12 items-end gap-1", className)} aria-hidden>
      {series.map((v, i) => (
        <span key={i} className={cn("w-2.5 rounded-t-sm", i === series.length - 1 ? "bg-brand-500" : "bg-brand-200")} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function CareerInsightCard({ insight, className }: { insight: CareerInsight; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-4">
        {insight.series && <Sparkbars series={insight.series} className="shrink-0" />}
        <p className="text-[13px] leading-relaxed text-ink-2">
          {insight.metric ? (
            <>
              Your {insight.metric.label.toLowerCase()} is <strong className="text-ink">{insight.metric.value} higher</strong> in product roles than last month.
            </>
          ) : (
            insight.body
          )}
        </p>
      </div>
      {insight.suggestion && (
        <Link href={insight.suggestion.href} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3 text-[12px] text-ink-2 transition-colors hover:bg-bg-soft">
          <Lightbulb className="size-4 shrink-0 text-warning-600" aria-hidden />
          <span className="flex-1">{insight.suggestion.text}</span>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </Link>
      )}
    </div>
  );
}
