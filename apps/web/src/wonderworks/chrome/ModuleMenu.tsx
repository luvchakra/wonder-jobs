"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { toast } from "@/components/feedback/Toast";
import { TINTS } from "@/wonderworks/brand/tiles";
import type { ModuleTint } from "@/wonderworks/manifest";
import { cn } from "@/lib/cn";

/** One entry in the menu: the active module's own choices (WonderJobs: Full Time Jobs, Part Time Jobs), or a module. */
export interface MenuItem {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  tint: ModuleTint;
  /** Whether it's the current value. */
  on: boolean;
}

/**
 * WonderWorks' module menu, in the centre of the top bar on every page (owner, 2026-10-29): the current value as text
 * with a chevron ("Full Time Jobs ▾", "Internships ▾"), opening a menu of the active module's own choices, then the
 * live modules and "Coming soon". A soft pulse invites the first tap, then stops for good. What a pick does is the
 * composition root's (`modules/chrome.tsx`): each tile is in its module's tint (§9 "Icons").
 */
export function ModuleMenu({ label, now, choices, live, upcoming, onChoice, onModule }: { /** The menu's name, e.g. "Kind of jobs". */ label: string; /** The current value, shown as its own row. */ now: Pick<MenuItem, "label" | "icon" | "tint">; choices: MenuItem[]; /** Modules that are open, picked like a choice. */ live: MenuItem[]; /** Modules still to come, shown under "Coming soon". */ upcoming: Omit<MenuItem, "on">[]; onChoice: (id: string, on: boolean) => void; onModule: (id: string, on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full min-w-0 md:max-w-[22rem]">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${now.label}`}
        title={now.label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-[14px] bg-surface-2 py-1.5 pl-1.5 pr-2 text-left transition-colors hover:bg-bg-soft wj-press md:gap-2.5 md:pr-2.5"
      >
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-[9px] md:size-8 md:rounded-[10px]", TINTS[now.tint].tile, TINTS[now.tint].icon)}>
          <now.icon className="size-[15px] md:size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink md:text-[14.5px]">{now.label}</span>
        {/* The chevron says it opens. */}
        <ChevronDown className={cn("size-3.5 shrink-0 text-ink-3 transition-transform md:size-4", open && "rotate-180")} strokeWidth={2.5} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-1/2 top-11 z-40 -translate-x-1/2 max-h-[calc(100dvh-var(--wj-mobile-nav-h,4.5rem)-5.5rem)] md:max-h-[min(75dvh,34rem)] w-[17rem] overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up">
          {choices.map((m) => {
            const on = m.on;
            const I = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  setOpen(false);
                  onChoice(m.id, on);
                }}
                className={cn("flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors", on ? "bg-brand-50" : "hover:bg-bg-soft")}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", on ? "wj-gradient-bg text-white" : `${TINTS[m.tint].tile} ${TINTS[m.tint].icon}`)}>
                  <I className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14.5px] font-semibold", on ? "text-brand-700" : "text-ink")}>{m.label}</span>
                  <span className="block text-[12px] text-ink-3">{m.hint}</span>
                </span>
                {on && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
              </button>
            );
          })}
          {/* The other WonderWorks modules that are open, picked the same way: the four tabs become the module's. */}
          {live.length > 0 && (
            <div role="group" aria-label="More on WonderWorks">
              <div className="mx-2 mb-1 mt-1.5 border-t border-line" />
              {live.map((k) => {
                const { icon: I, tint, on } = k;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      setOpen(false);
                      onModule(k.id, on);
                    }}
                    className={cn("flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors", on ? "bg-brand-50" : "hover:bg-bg-soft")}
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", on ? "wj-gradient-bg text-white" : `${TINTS[tint].tile} ${TINTS[tint].icon}`)}>
                      <I className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[14.5px] font-semibold", on ? "text-brand-700" : "text-ink")}>{k.label}</span>
                      <span className="block text-[12px] text-ink-3">{k.hint}</span>
                    </span>
                    {on && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
          {/* Not built yet: shown muted and not selectable, with no listings behind them. */}
          {upcoming.length > 0 && (
            <div role="group" aria-label="Coming soon">
              <div className="mx-2 mb-1 mt-1.5 border-t border-line" />
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-4">Coming soon</p>
              {upcoming.map((k) => {
                const { icon: I, tint } = k;
                return (
                  <button key={k.id} type="button" role="menuitem" aria-disabled="true" onClick={() => toast.info(`${k.label} is coming soon`)} className="flex w-full cursor-default items-center gap-3 rounded-[14px] px-2.5 py-1.5 text-left opacity-70">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", TINTS[tint].tile, TINTS[tint].icon)}>
                      <I className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* "Soon" takes the checkmark's place, at the end of the title line, so the subtitle keeps the whole width (one line). */}
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-medium text-ink-2">{k.label}</span>
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Soon</span>
                      </span>
                      <span className="block text-[12px] text-ink-4">{k.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
