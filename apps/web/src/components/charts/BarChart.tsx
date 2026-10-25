"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface ChartPoint {
  key: string;
  /** Under the bar (x axis): "24", "24 Oct". */
  tick: string;
  /** In full, when tapped: "Sat, 24 Oct". */
  label: string;
  value: number;
  /** More numbers for the tapped bar. */
  details?: { label: string; value: string }[];
  /** Where "Open" goes for the tapped bar. */
  href?: string;
}

/** Back and forth along the timeline: what's shown, and earlier / later (absent: nothing further that way). */
export interface ChartRange {
  label: string;
  onPrev?: () => void;
  onNext?: () => void;
}

/** ‹ 19 – 25 Oct › — shared by a page's period and a chart's own window. */
export function RangeNav({ range, className }: { range: ChartRange; className?: string }) {
  const btn = "grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg-soft disabled:opacity-30";
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button type="button" onClick={range.onPrev} disabled={!range.onPrev} aria-label="Earlier" className={btn}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="min-w-[108px] text-center text-[12.5px] font-medium tabular-nums text-ink" aria-live="polite">
        {range.label}
      </span>
      <button type="button" onClick={range.onNext} disabled={!range.onNext} aria-label="Later" className={btn}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** The top of the y axis: the first round number at or above the highest bar (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × a power of ten; whole numbers below 10). */
export function scaleTop(max: number): number {
  if (max <= 2) return 2;
  const pow = 10 ** Math.floor(Math.log10(max));
  const steps = pow === 1 ? [1, 2, 3, 4, 5, 6, 8, 10] : [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return steps.map((m) => m * pow).find((s) => s >= max) ?? 10 * pow;
}

/**
 * A bar chart that says what it shows: the y axis named and scaled (0, half, top), the x axis named with its ticks,
 * the period's total, average and peak above it, and any bar tapped (or focused) for its own numbers. `range` adds
 * the back-and-forth timeline.
 */
export function BarChart({ points, yLabel, xLabel, unit, range, className }: { points: ChartPoint[]; yLabel: string; xLabel: string; unit: string; range?: ChartRange; className?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const top = scaleTop(Math.max(0, ...points.map((p) => p.value)));
  const total = points.reduce((n, p) => n + p.value, 0);
  const peak = points.reduce<ChartPoint | undefined>((b, p) => (!b || p.value > b.value ? p : b), undefined);
  const sel = points.find((p) => p.key === picked);
  // Ticks under the first, middle and last bar (and the tapped one), so they never crowd.
  const showTick = (i: number) => points.length <= 8 || i === 0 || i === points.length - 1 || i === Math.floor((points.length - 1) / 2);

  return (
    <div className={className}>
      {range && <RangeNav range={range} className="-mt-1 mb-1 justify-end" />}
      {/* The tapped bar's numbers, else the period's. */}
      <div className="mb-2 min-h-[38px] rounded-[10px] bg-surface-2 px-2.5 py-1.5 text-[12px] leading-snug" aria-live="polite">
        {sel ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-semibold text-ink">{sel.label}</span>
            <span className="text-ink-2">
              <b className="tabular-nums text-ink">{formatNumber(sel.value)}</b> {unit}
            </span>
            {sel.details?.map((d) => (
              <span key={d.label} className="text-ink-3">
                {d.label} <b className="tabular-nums text-ink-2">{d.value}</b>
              </span>
            ))}
            {sel.href && (
              <Link href={sel.href} className="font-medium text-brand-700 hover:underline">
                Open
              </Link>
            )}
          </div>
        ) : points.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-3">
            <span>
              Total <b className="tabular-nums text-ink">{formatNumber(total)}</b>
            </span>
            <span>
              Average <b className="tabular-nums text-ink">{formatNumber(Math.round((total / points.length) * 10) / 10)}</b>
            </span>
            {peak && peak.value > 0 && (
              <span>
                Peak <b className="tabular-nums text-ink">{formatNumber(peak.value)}</b> · {peak.label}
              </span>
            )}
            <span className="text-ink-4">Tap a bar for details</span>
          </div>
        ) : (
          <span className="text-ink-3">Nothing in this period.</span>
        )}
      </div>
      <p className="mb-0.5 text-[10.5px] font-medium text-ink-3">↑ {yLabel}</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-1.5">
        {/* y axis */}
        <div className="flex h-28 flex-col justify-between text-right text-[10px] tabular-nums leading-none text-ink-4" aria-hidden>
          <span>{formatNumber(top)}</span>
          <span>{formatNumber(Math.round(top / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative h-28 border-b border-l border-line">
          <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
          <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden />
          <div className="absolute inset-0 flex items-end gap-[3px] px-[2px]" role="group" aria-label={`${yLabel} by ${xLabel.toLowerCase()}`}>
            {points.map((p) => {
              const on = p.key === picked;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.label}: ${p.value} ${unit}`}
                  onClick={() => setPicked(on ? null : p.key)}
                  className="group flex h-full flex-1 items-end focus-visible:outline-none"
                >
                  <span className={cn("block w-full rounded-t-[3px] transition-colors", on ? "bg-brand-700" : picked ? "bg-brand-200" : "bg-brand-500 group-hover:bg-brand-600 group-focus-visible:bg-brand-700")} style={{ height: p.value ? `${Math.max(3, (p.value / top) * 100)}%` : "2px", opacity: p.value ? 1 : 0.35 }} />
                </button>
              );
            })}
          </div>
        </div>
        <span />
        {/* x axis */}
        <div className="mt-1 flex gap-[3px] px-[2px] text-[10px] leading-none text-ink-4" aria-hidden>
          {points.map((p, i) => (
            <span key={p.key} className={cn("flex-1 truncate text-center", p.key === picked && "font-semibold text-ink")}>
              {showTick(i) || p.key === picked ? p.tick : ""}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-right text-[10.5px] font-medium text-ink-3">{xLabel} →</p>
    </div>
  );
}
