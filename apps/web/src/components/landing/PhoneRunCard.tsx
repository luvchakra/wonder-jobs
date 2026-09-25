import { Check, Loader2, Bot } from "lucide-react";
import { cn } from "@/lib/cn";

/** Small phone frame showing a live run — used in marketing sections. Purely illustrative markup. */
export function PhoneRunCard({ className, stage = 3 }: { className?: string; stage?: number }) {
  const steps = ["Understanding your goals", "Searching the market", "Removing duplicates", "Comparing with your profile", "Prioritizing for you", "Preparing application packs"];
  const sub = ["From your own words", "412 found", "32 removed", "Finding your best fits", "", ""];
  return (
    <div className={cn("w-[250px] rounded-[30px] border border-white/60 bg-white p-3 shadow-lg", className)} aria-label="Preview of a Wonder search on mobile">
      <div className="rounded-[22px] bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white">Search</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-[10px] font-semibold text-success-600">
            <span className="size-1.5 rounded-full bg-success-600" /> Live
          </span>
        </div>
        <p className="mt-2 text-[15px] font-semibold leading-tight text-ink">Wonder is finding opportunities</p>
        <ol className="mt-3 space-y-2.5">
          {steps.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <li key={s} className="flex items-start gap-2">
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", done ? "border-brand-500 bg-brand-500 text-white" : active ? "border-brand-500 text-brand-600" : "border-line-strong")}>
                  {done ? <Check className="size-2.5" strokeWidth={4} /> : active ? <Loader2 className="size-2.5 wj-animate-spin" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-[11px] font-medium leading-tight", done || active ? "text-ink" : "text-ink-4")}>{s}</span>
                  {sub[i] && (done || active) && <span className="block text-[9.5px] text-ink-3">{sub[i]}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-brand-500 px-3 py-1.5 text-[10px] font-semibold text-white">
          <Bot className="size-3" aria-hidden /> Wonder is working…
        </div>
      </div>
    </div>
  );
}
