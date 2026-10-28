"use client";
import { useEffect, useRef, useState } from "react";
import { Briefcase, CalendarHeart, Check, ChevronDown, Clock, GraduationCap, Handshake, HeartPulse, School, ShoppingBag, Users } from "lucide-react";
import { useJobsStore } from "@/store/jobs";
import { findModeOf, type FindMode } from "@/domain/jobs/findMode";
import { switchFindMode } from "@/lib/switchFindMode";
import { UPCOMING_KINDS, type UpcomingKindId } from "@/domain/jobs/upcomingKinds";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

const MODES: { mode: FindMode; label: string; hint: string; icon: typeof Briefcase }[] = [
  { mode: "full_time", label: "Full Time Jobs", hint: "Searches your Career Profile", icon: Briefcase },
  { mode: "part_time", label: "Part Time Jobs", hint: "Searches the words you type", icon: Clock },
  { mode: "internships", label: "Internships", hint: "Student roles and co-ops", icon: GraduationCap },
];
// An icon for each coming-soon kind (the labels and lines are in domain/jobs/upcomingKinds.ts).
const UPCOMING_ICON: Record<UpcomingKindId, typeof Briefcase> = {
  teaching: School,
  cofounders: Handshake,
  talent_services: Users,
  therapists: HeartPulse,
  events_social: CalendarHeart,
  buy_sell_rent: ShoppingBag,
};
const SEEN = "wj.findModeMenuSeen";
const seen = () => {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return true;
  }
};

/**
 * Find's Full Time / Part Time switch, in the top bar (owner, 2026-10-25; centred between the avatar and the logo on a phone, see TopBar): a round icon button — the
 * current kind's icon with a chevron — that opens a menu of "Full Time Jobs" and "Part Time Jobs". A soft pulse
 * invites the first tap, then stops for good. Choosing one switches Find's mode in place.
 */
export function FindModeMenu() {
  const current = useJobsStore((s) => findModeOf(s.filters));
  const [open, setOpen] = useState(false);
  // The coming-soon kinds the platform shows, in its order (Admin → Settings → Menus → Find menu).
  const upcoming = arrangeMenu([...UPCOMING_KINDS], useMenu("find_kinds"));
  // The pulse that invites a first tap: until the menu has been opened once on this browser.
  const [hint, setHint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Read after mount (browser storage isn't there on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHint(!seen());
  }, []);
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

  const now = MODES.find((m) => m.mode === current)!;
  const Icon = now.icon;
  const toggle = () => {
    setOpen((v) => !v);
    if (hint) {
      setHint(false);
      try {
        localStorage.setItem(SEEN, "1");
      } catch {
        /* the pulse just shows again next time */
      }
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kind of jobs: ${now.label}`}
        title={now.label}
        onClick={toggle}
        className="relative grid size-8 place-items-center rounded-full wj-gradient-bg text-white shadow-brand wj-press"
      >
        {hint && <span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-brand-400 motion-safe:animate-ping" />}
        <Icon className="size-[14.4px]" aria-hidden />
        {/* The chevron says it opens. */}
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-[14.4px] place-items-center rounded-full bg-surface text-brand-700 shadow-sm ring-1 ring-brand-200">
          <ChevronDown className={cn("size-[9.6px] transition-transform", open && "rotate-180")} strokeWidth={3} />
        </span>
      </button>
      {open && (
        <div role="menu" aria-label="Kind of jobs" className="absolute left-0 top-10 z-40 max-h-[calc(100dvh-var(--wj-mobile-nav-h,4.5rem)-5.5rem)] md:max-h-[min(75dvh,34rem)] w-[17rem] overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up">
          {MODES.map((m) => {
            const on = m.mode === current;
            const I = m.icon;
            return (
              <button
                key={m.mode}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  setOpen(false);
                  if (!on) switchFindMode(m.mode);
                }}
                className={cn("flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors", on ? "bg-brand-50" : "hover:bg-bg-soft")}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", on ? "wj-gradient-bg text-white" : "bg-surface-2 text-ink-2")}>
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
          {/* Not built yet: shown muted and not selectable, with no listings behind them. */}
          {upcoming.length > 0 && (
            <div role="group" aria-label="Coming soon">
              <div className="mx-2 mb-1 mt-1.5 border-t border-line" />
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-4">Coming soon</p>
              {upcoming.map((k) => {
                const I = UPCOMING_ICON[k.id];
                return (
                  <button key={k.id} type="button" role="menuitem" aria-disabled="true" onClick={() => toast.info(`${k.label} is coming soon`)} className="flex w-full cursor-default items-center gap-3 rounded-[14px] px-2.5 py-1.5 text-left opacity-70">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3">
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
