"use client";
import { ExternalLink } from "lucide-react";
import { LEARN_PLATFORMS } from "@/domain/skills/learn";
import { cn } from "@/lib/cn";

/** What Microsoft Learn's public catalog has (`/api/skill-up/learn`). */
export interface LearnItem {
  kind: "certification" | "learning path";
  title: string;
  url: string;
  summary: string;
  minutes?: number;
  level?: string;
}
/** Where to learn it: Microsoft Learn's own entries when it has them, then each platform's search for the term. */
export function Resources({ term, items }: { term: string; items: LearnItem[] }) {
  return (
    <div className="mt-3">
      {items.length > 0 && (
        <>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">From Microsoft Learn</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={i.url}>
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-[12px] bg-surface-2 px-3 py-2 hover:bg-bg-soft">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium text-ink">{i.title}</span>
                    <span className="text-[11px] text-ink-3">{[i.kind === "certification" ? "Certification" : "Learning path", i.level, i.minutes ? `${Math.round(i.minutes / 60) || 1} h` : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-ink-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className={cn("text-[11px] font-semibold uppercase tracking-wide text-ink-4", items.length > 0 && "mt-3")}>Find courses</h3>
      {/* One row that scrolls sideways on a phone, rather than three lines of chips. */}
      <ul className="-mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {LEARN_PLATFORMS.map((p) => (
          <li key={p.id} className="shrink-0">
            <a href={p.href(term)} target="_blank" rel="noopener noreferrer" aria-label={`Search ${p.name} for ${term}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:bg-surface-2">
              {p.name} <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
