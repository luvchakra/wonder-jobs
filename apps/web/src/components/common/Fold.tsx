import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** A section that stays closed until it's wanted: a title and one-line summary; the detail opens in place. */
export function Fold({ title, hint, open, className, children }: { title: string; hint?: string; open?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <details open={open} className={cn("wj-card group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {hint && <span className="block text-[12px] text-ink-3">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
