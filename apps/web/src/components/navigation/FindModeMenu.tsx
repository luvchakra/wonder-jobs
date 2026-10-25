"use client";
import { useEffect, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, Clock } from "lucide-react";
import { useJobsStore } from "@/store/jobs";
import { findModeOf, type FindMode } from "@/domain/jobs/findMode";
import { switchFindMode } from "@/lib/switchFindMode";
import { cn } from "@/lib/cn";

const MODES: { mode: FindMode; label: string; hint: string; icon: typeof Briefcase }[] = [
  { mode: "full_time", label: "Full Time Jobs", hint: "Searches your Career Profile", icon: Briefcase },
  { mode: "part_time", label: "Part Time Jobs", hint: "Searches the words you type", icon: Clock },
];
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
        <div role="menu" aria-label="Kind of jobs" className="absolute left-0 top-10 z-40 w-[17rem] rounded-[18px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up">
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
        </div>
      )}
    </div>
  );
}
