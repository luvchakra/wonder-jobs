"use client";
import Link from "next/link";
import { ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The second UI's shared layout parts (owner, 2026-11-28; domain/platform/ui.ts): the page header, the chip row, a
 * section's header and its horizontally scrolling rail. They are presentation only: every title, count and link is
 * given by the screen that uses them, from real data. Tap targets are 44px.
 */

/** A page's top: a bold title, a small accent context line with a chevron (what you're looking at), the profile button. */
export function Header({ title, context, onContext, profileHref, profileLabel = "Your profile", avatar, actions }: { title: string; context?: string; onContext?: () => void; profileHref?: string; profileLabel?: string; /** The person's own picture, in place of the outline icon. */ avatar?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <h1 className="truncate text-[23px] font-bold leading-tight text-ink">{title}</h1>
        {context &&
          (onContext ? (
            <button type="button" onClick={onContext} className="-ml-1 mt-0.5 inline-flex min-h-11 max-w-full items-center gap-0.5 rounded-full px-1 text-[13px] font-medium text-brand-600">
              <span className="truncate">{context}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </button>
          ) : (
            <p className="mt-0.5 truncate text-[13px] font-medium text-brand-600">{context}</p>
          ))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {profileHref && (
          <Link href={profileHref} aria-label={profileLabel} className="grid size-11 place-items-center overflow-hidden rounded-full border border-line text-ink">
            {avatar ?? <UserRound className="size-5" aria-hidden />}
          </Link>
        )}
      </div>
    </header>
  );
}

export interface Chip {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
}

/** A sticky row of outlined pills. The active one is filled with the accent tint. */
export function ChipRow({ chips, active, onPick, label, className }: { chips: Chip[]; active?: string; onPick?: (id: string) => void; label: string; className?: string }) {
  const cls = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors duration-150", on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink");
  return (
    <div role="group" aria-label={label} className={cn("wj-scrollbar-none flex snap-x gap-2 overflow-x-auto px-4 py-2", className)}>
      {chips.map((c) =>
        c.href ? (
          <Link key={c.id} href={c.href} aria-current={c.id === active ? "page" : undefined} className={cls(c.id === active)}>
            {c.icon}
            {c.label}
          </Link>
        ) : (
          <button key={c.id} type="button" aria-pressed={c.id === active} onClick={() => onPick?.(c.id)} className={cls(c.id === active)}>
            {c.icon}
            {c.label}
          </button>
        ),
      )}
    </div>
  );
}

/** A section's title, an optional grey line under it, and "See all" on the right. */
export function SectionHeader({ title, subtitle, seeAllHref, seeAllLabel = "See all" }: { title: string; subtitle?: string; seeAllHref?: string; seeAllLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4">
      <div className="min-w-0">
        <h2 className="truncate text-[18px] font-semibold leading-snug text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-ink-3">{subtitle}</p>}
      </div>
      {seeAllHref && (
        <Link href={seeAllHref} className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-1 text-[13px] font-semibold text-brand-600">
          {seeAllLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/**
 * A horizontally scrolling row of cards that snaps, with the next card peeking in from the edge. Each child is one
 * card; `width` is a card's width on a phone ("wide" for info cards, "narrow" for portrait cards and tiles). From
 * 640px cards take a fixed width, so a wider screen simply shows more of them.
 */
export function CardRail({ label, width = "wide", rows = 1, children, className }: { label: string; width?: "wide" | "narrow"; /** Two rows of tiles scrolling together (category tiles). */ rows?: 1 | 2; children: React.ReactNode[]; className?: string }) {
  const item = width === "wide" ? "w-[78%] sm:w-[300px]" : "w-[42%] sm:w-[180px]";
  if (rows === 2) {
    return (
      <ul aria-label={label} className={cn("wj-scrollbar-none grid snap-x snap-mandatory grid-flow-col grid-rows-2 gap-3 overflow-x-auto scroll-px-4 px-4 pb-1", width === "wide" ? "auto-cols-[78%] sm:auto-cols-[300px]" : "auto-cols-[62%] sm:auto-cols-[240px]", className)}>
        {children.map((c, i) => (
          <li key={i} className="snap-start">
            {c}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-label={label} className={cn("wj-scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1", className)}>
      {children.map((c, i) => (
        <li key={i} className={cn("shrink-0 snap-start", item)}>
          {c}
        </li>
      ))}
    </ul>
  );
}

/** A screen's vertical stack of sections: 28px between them. */
export function Sections({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-7 pb-6", className)}>{children}</div>;
}

/** One section: its header, then its rail or grid. */
export function Section({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>;
}
