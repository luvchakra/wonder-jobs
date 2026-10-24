import { cn } from "@/lib/cn";

/**
 * A company's rating out of 5 as five stars, filled to the decimal (3.5 fills three and a half), with the number.
 * `title` says where it's from — the card never shows a rating without its source one hover away.
 */
export function RatingStars({ value, title, className, size = 11, inline = false }: { value: number; title?: string; className?: string; size?: number; inline?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = "★★★★★";
  return (
    <span className={cn("inline-flex items-center leading-none", inline ? "gap-1.5" : "flex-col", className)} title={title} role="img" aria-label={`Rated ${value.toFixed(1)} out of 5${title ? `. ${title}` : ""}`}>
      <span className="relative inline-block tracking-[-0.5px]" style={{ fontSize: size }} aria-hidden>
        <span className="text-ink-4/40">{row}</span>
        <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-[#f5a623]" style={{ width: `${pct}%` }}>
          {row}
        </span>
      </span>
      <span className={cn("font-medium text-ink-3", inline ? "text-[13px] text-ink" : "mt-0.5 text-[11px]")} aria-hidden>
        {value.toFixed(1)}
      </span>
    </span>
  );
}
