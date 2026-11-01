"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Loader2 } from "lucide-react";
import { TRANSLATE_LANGUAGES, type TranslateLanguageId } from "@/domain/translate/translate";
import { cn } from "@/lib/cn";

/**
 * The language menu on a job's description: a round pill with a language icon, opening a list — Original first, then
 * English and the other major languages (each with its own name). The current choice is checked; while one is being
 * translated the pill shows it working.
 */
export function LanguageMenu({ value, busy, onChange }: { value: TranslateLanguageId | null; busy: boolean; onChange: (v: TranslateLanguageId | null) => void }) {
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
  const current = TRANSLATE_LANGUAGES.find((l) => l.id === value);
  const choose = (v: TranslateLanguageId | null) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };
  const row = (on: boolean) => cn("flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[14px]", on ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-2 hover:bg-bg-soft");

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `Description language: ${current.name}` : "Translate the description"}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium wj-press transition-colors", current ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
      >
        {busy ? <Loader2 className="size-4 wj-animate-spin" aria-hidden /> : <Languages className="size-4" aria-hidden />}
        {current ? current.name : "Translate"}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Translate the description" className="absolute right-0 top-11 z-30 max-h-[min(70dvh,26rem)] w-56 overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up">
          <button type="button" role="menuitemradio" aria-checked={value === null} onClick={() => choose(null)} className={row(value === null)}>
            <span className="flex-1">Original</span>
            {value === null && <Check className="size-4" aria-hidden />}
          </button>
          <div className="mx-2 my-1 border-t border-line" />
          {TRANSLATE_LANGUAGES.map((l) => (
            <button key={l.id} type="button" role="menuitemradio" aria-checked={value === l.id} onClick={() => choose(l.id)} className={row(value === l.id)}>
              <span className="flex-1">
                {l.name}
                {l.native !== l.name && <span className="ml-1.5 text-[12px] font-normal text-ink-3">{l.native}</span>}
              </span>
              {value === l.id && <Check className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
