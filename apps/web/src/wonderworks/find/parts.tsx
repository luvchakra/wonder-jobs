"use client";
export { shortSourceNames } from "./sourceName";
import { shortSourceNames } from "./sourceName";
import { ListingShare, type ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Bookmark, CheckCircle2, ChevronDown, History, Search, SlidersHorizontal, X } from "lucide-react";
import { Chip, Input, Select } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { DictateButton } from "@/components/common/DictateButton";
import { PlaceInput } from "@/components/common/PlaceInput";
import type { Dictation } from "@/lib/dictation";
import { cn } from "@/lib/cn";

/**
 * Find's building blocks, shared by every WonderWorks module (docs/WONDERWORKS_PLATFORM.md §4.1): the search box, the
 * row of Refine / pills / round Search button, the Refine panel and its fields, the results line, grid and cards.
 * Extracted from the jobs portal's Find (components/jobs/JobFilters.tsx, JobsBoard.tsx, JobCard.tsx), which renders
 * through them unchanged, so a module's Find looks and works like Jobs' and only its fields differ.
 */

/** Refine's chips: small enough that each group fits one line on a phone. */
export const REFINE_CHIP = "h-7 px-2.5 text-[12px] max-[430px]:px-2 max-[380px]:px-1.5 max-[380px]:text-[11.5px]";

export const PILL = "relative flex h-10 min-w-0 items-center rounded-full border border-line bg-surface text-[15px] text-ink shadow-xs transition-colors hover:border-ink-4/40";

/** What's typed, against a history: the ones containing it, not itself. */
export const historyFor = (items: string[], text: string) => {
  const now = text.trim().toLowerCase();
  return items.filter((t) => t.toLowerCase() !== now && (!now || t.toLowerCase().includes(now)));
};

/** The last few searches under a box while it has focus: a tap uses one, × forgets it. */
export function RecentSearches({ items, onPick, onForget }: { items: string[]; onPick: (t: string) => void; onForget: (t: string) => void }) {
  if (!items.length) return null;
  return (
    // Taps here mustn't take the focus from the box first (that would close the list before the tap lands).
    <ul aria-label="Recent searches" className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[16px] border border-line bg-surface py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
      {items.map((t) => (
        <li key={t} className="flex items-center">
          <button type="button" onClick={() => onPick(t)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3.5 text-left text-[14px] text-ink hover:bg-bg-soft">
            <History className="size-4 shrink-0 text-ink-4" aria-hidden />
            <span className="truncate">{t}</span>
          </button>
          <button type="button" aria-label={`Remove “${t}” from recent searches`} onClick={() => onForget(t)} className="mr-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Closes the phone's keyboard: the focused box lets go, so the results it's about to show aren't hidden behind the
 * keyboard (owner, 2026-11-06: "bring down the keyboard automatically as soon as it starts searching").
 */
export function closeKeyboard() {
  if (typeof document === "undefined") return;
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) el.blur();
}

/**
 * Find's search form, the same in every module (owner, 2026-11-06: "design the tablet and desktop ui … DO NOT CHANGE
 * MOBILE"). Phones and tablets: the box, then the row of Refine, the module's pills and Search under it. From 1024px:
 * one row at the top of the page, the box taking what's left up to a set width, and Refine just before Search (owner,
 * 2026-11-06: "move the refine option to right, just before the search").
 */
export const FIND_FORM = "flex flex-col gap-2 lg:min-w-0 lg:flex-1 lg:flex-row lg:items-center";
/** The search box (or Full Time's role line) in the one-row form from 1024px: what the row leaves, never wider than a set width. */
export const FIND_TOP_BOX = "lg:min-w-0 lg:max-w-[32rem] lg:flex-1";
// A set width, not the whole row (owner, 2026-11-06: "don't have so long search boxes, shorten them to look elegant").
export const FIND_BOX = "lg:w-[26rem] lg:flex-none xl:w-[30rem]";
export const FIND_ROW = "flex items-center gap-2 lg:shrink-0";
/** The row's first, wide pill (a place, a time): fills the row on phones and tablets, a set width beside the box from 1024px. */
export const FIND_PILL_WIDE = "min-w-0 flex-auto lg:w-44 lg:flex-none xl:w-56";
/** From 1024px Refine sits after the module's pills, just before Search (which comes last). Phones and tablets: first. */
export const FIND_REFINE = "lg:order-1";
export const FIND_SUBMIT = "lg:order-2";
/**
 * What Refine opens over from 1024px (the search area holding the form and the panel). From 1024px it stays at the top
 * of the window while the results scroll under it (owner, 2026-11-06: "while scrolling the page, dont scroll up this").
 */
/** A page's filter row kept at the top of the window from 1024px, on the page's background (Find, and Saved's filters). */
export const FIND_PIN = "lg:sticky lg:top-0 lg:z-30 lg:-mx-8 lg:-mt-5 lg:bg-bg/95 lg:px-8 lg:pb-3 lg:pt-5 lg:backdrop-blur";
export const FIND_AREA = `relative ${FIND_PIN}`;
/**
 * The results line ("Showing 68 jobs from 12 sources", Sort) right under it from 1024px, pinned too (owner, 2026-11-06:
 * "also fix this, do not scroll this"). Its top is the search area's height: 20px + the 40px row + 12px.
 */
export const FIND_RESULTS_PIN = "lg:sticky lg:top-[72px] lg:z-20 lg:-mx-8 lg:mb-1 lg:bg-bg/95 lg:px-8 lg:pb-2 lg:backdrop-blur";

/** The search box: the magnifier, the words, clear and the microphone, and the recent searches while it has focus. */
export function SearchBox({ value, onValue, onClear, placeholder, label, dictation, dictateLabel, focused, onFocused, history, onPick, onForget, className }: { value: string; onValue: (text: string) => void; onClear: () => void; placeholder: string; label: string; dictation: Dictation; dictateLabel: string; focused: boolean; onFocused: (on: boolean) => void; history: string[]; onPick: (t: string) => void; onForget: (t: string) => void; className?: string }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
      <Input
        value={value}
        onChange={(e) => {
          onValue(e.target.value);
          if (dictation.listening) dictation.rebase(e.target.value);
        }}
        onFocus={() => onFocused(true)}
        onBlur={() => onFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFocused(false);
        }}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        className={cn("h-10 rounded-full pl-10", dictation.supported ? "pr-20" : "pr-10")}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button type="button" aria-label="Clear search" onClick={onClear} className="rounded-full p-2 text-ink-4 hover:bg-bg-soft hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        )}
        {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label={dictateLabel} />}
      </div>
      {focused && <RecentSearches items={history} onPick={onPick} onForget={onForget} />}
    </div>
  );
}

/**
 * Saved's box: the words narrow what's already saved as they're typed (no source search). Enter (or the arrow) keeps
 * them, goes into Saved's history and closes the keyboard.
 */
export function FilterBox({ text, onText, label, dictation, dictateLabel, history, onEnter, onForget, className }: { text: string; onText: (t: string) => void; label: string; dictation: Dictation; dictateLabel: string; history: string[]; onEnter: (t: string) => void; onForget: (t: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false);
  const enter = (t = text) => {
    onEnter(t);
    setFocused(false);
    closeKeyboard();
  };
  return (
    <form
      className={cn("relative min-w-0", className)}
      onSubmit={(e) => {
        e.preventDefault();
        enter();
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
      {/* A plain text box: the browser's own clear button would be a second ×. */}
      <Input
        inputMode="search"
        value={text}
        onChange={(e) => {
          onText(e.target.value);
          if (dictation.listening) dictation.rebase(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFocused(false);
        }}
        placeholder={label}
        aria-label={label}
        enterKeyHint="search"
        className={cn("h-11 rounded-full pl-10 sm:h-12", text ? (dictation.supported ? "pr-28" : "pr-20") : dictation.supported ? "pr-12" : "pr-4")}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {text && (
          <button type="button" aria-label="Clear filter" onClick={() => onText("")} className="rounded-full p-2 text-ink-4 hover:bg-bg-soft hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        )}
        {text.trim() && (
          <button type="submit" aria-label="Enter" className="grid size-8 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700">
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
        {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label={dictateLabel} />}
      </div>
      {focused && (
        <RecentSearches
          items={historyFor(history, text)}
          onPick={(t) => {
            onText(t);
            enter(t);
          }}
          onForget={onForget}
        />
      )}
    </form>
  );
}

const TOGGLE = "inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors";

/** A checkbox as a pill (Saved's Hide Pipeline, Easy Apply only). */
export function TogglePill({ label, title, checked, onChange }: { label: string; title?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label title={title} className={cn(TOGGLE, checked ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink")}>
      <input type="checkbox" className="size-3.5 shrink-0 accent-[var(--color-brand-600)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Under the box: what dictation hears, and its error. */
export function DictationNotes({ dictation, hint }: { dictation: Dictation; hint: string }) {
  return (
    <>
      {dictation.listening && <p aria-live="polite" className="-mt-1 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : hint}</p>}
      {dictation.error && <p role="alert" className="-mt-1 text-[12px] text-danger-600">{dictation.error}</p>}
    </>
  );
}

/** Opens and closes Refine: the first control in the row under the search box. */
export function RefineToggle({ open, count, onToggle, className }: { open: boolean; count: number; onToggle: () => void; className?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`Refine${count ? `, ${count} set` : ""}`} title="Refine" className={cn(PILL, "shrink-0 gap-2.5 px-4 font-semibold max-[380px]:px-3", open && "border-brand-200 bg-brand-50", className)}>
      <SlidersHorizontal className="size-4" aria-hidden />
      {count ? <span>{count}</span> : null}
    </button>
  );
}

/** A pill that opens Refine at its own section, labelled with what's picked there. */
export function PillButton({ label, shown, open, onClick, className }: { label: string; shown: string; open: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${shown}`} aria-expanded={open} className={cn(PILL, "gap-1 pl-3.5 pr-2.5 text-left text-[14px] max-[430px]:pl-2.5 max-[430px]:pr-1.5 max-[430px]:text-[12.5px]", className)}>
      <span className="min-w-0 flex-1 truncate">{shown}</span>
      <ChevronDown className="size-4 shrink-0 text-ink-2 max-[430px]:size-3.5" aria-hidden />
    </button>
  );
}

/** The round Search button that ends the row. */
export function SearchSubmit({ label, className }: { label: string; className?: string }) {
  return (
    <button type="submit" aria-label={label} title={label} className={cn("wj-gradient-bg grid size-10 shrink-0 place-items-center rounded-full text-white shadow-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", className)}>
      <ArrowRight className="size-5" aria-hidden />
    </button>
  );
}

/** A Refine section the row's pills open: scrolled to, focused and lit for a moment. */
export const refineSectionClass = (lit: boolean) => cn("-m-1.5 flex flex-col gap-1 rounded-[12px] p-1.5 text-[13px] font-medium text-ink-2 outline-none transition-shadow", lit && "ring-2 ring-brand-400 bg-brand-50/60");

/**
 * The Refine panel: a back arrow and one corner option, the module's own top (e.g. "Search as"), its fields, one Save,
 * and a line of links under it.
 */
export function RefinePanel({ backLabel, onBack, corner, top, children, onSave, links }: { backLabel: string; onBack: () => void; corner?: React.ReactNode; top?: React.ReactNode; children: React.ReactNode; onSave: () => void; links?: React.ReactNode }) {
  return (
    <>
      {/* From 1024px, a click outside the panel goes back, as Back does. Not on phones or tablets. */}
      <button type="button" tabIndex={-1} aria-hidden onClick={onBack} className="fixed inset-0 z-10 hidden cursor-default lg:block" />
      {/* From 1024px Refine opens over the results, under the search row (FIND_AREA), instead of pushing them down; the
          page keeps its place. Phones and tablets: in the flow, as before. */}
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-[16px] border border-line bg-surface px-3 py-2.5 sm:grid-cols-2 sm:p-4 lg:absolute lg:inset-x-0 lg:top-full lg:z-20 lg:mt-2 lg:max-h-[min(72vh,680px)] lg:grid-cols-3 lg:overflow-y-auto lg:shadow-xl [&>*]:min-w-0">
      <div className="-mb-1 flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
        {/* Back to the list without changing anything typed here: the arrow alone (owner, 2026-11-01), its words kept as
            the button's name for screen readers and tests. */}
        <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="-ml-1.5 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-bg-soft hover:text-ink">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        {corner}
      </div>
      {top && <div className="border-b border-line pb-2 sm:col-span-2 lg:col-span-3 [&>*:last-child]:mb-0">{top}</div>}
      {children}
      {/* One action: keep what's set here and go back to the list. */}
      <div className="sticky bottom-[calc(var(--wj-mobile-nav-h)+0.5rem)] flex flex-wrap items-center gap-2 border-t border-line bg-surface pt-2 sm:col-span-2 md:bottom-2 lg:col-span-3">
        <Button className="min-w-0 flex-1 sm:flex-none" onClick={onSave}>
          Save
        </Button>
      </div>
      {links && <div className="flex flex-wrap items-center gap-x-4 text-[13px] sm:col-span-2 lg:col-span-3">{links}</div>}
    </div>
    </>
  );
}

/** A labelled Refine field: the label, then its control. */
export function RefineField({ label, className, children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1 text-[13px] font-medium text-ink-2", className)}>
      {label}
      {children}
    </div>
  );
}

/** One choice among a few, as Refine's chips; the first, `isDefault`, is where it starts. */
export function ChoiceChips<T extends string | number>({ options, value, onPick }: { options: { value: T; label: React.ReactNode; isDefault?: boolean }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Chip key={String(o.value)} active={value === o.value} isDefault={o.isDefault} onClick={() => onPick(o.value)} className={REFINE_CHIP}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/** A short select in Refine (e.g. Posted). */
export function RefineSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={cn("flex w-32 shrink-0 flex-col gap-1 text-[13px] font-medium text-ink-2", className)}>
      {label}
      <Select className="h-9 text-[14px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** A checkbox option in Refine (Easy Apply only, Hide Pipeline, Remote only). */
export function RefineCheck({ label, title, checked, onChange, className }: { label: string; title?: string; checked: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <label title={title} className={cn("flex min-h-8 shrink-0 cursor-pointer items-center gap-2 text-[13px] text-ink", className)}>
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-brand-600)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Location in Refine: real places worldwide as you type; each picked one a pill, as many as wanted. */
export function RefinePlaces({ places, onChange }: { places: string[]; onChange: (places: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1 text-[13px] font-medium text-ink-2">
      <span aria-hidden>Location</span>
      <PlaceInput inputClassName="h-9 text-[14px]" label="Location" places={places} onChange={onChange} placeholder={places.some((p) => !/^remote$/i.test(p)) ? "Add another place" : "Anywhere — e.g. Dubai"} />
    </div>
  );
}

/** "Sort by Relevance ▾": a select that reads as a line of text. */
export function SortSelect<T extends string>({ value, labels, onChange, className }: { value: T; labels: Record<T, string>; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={cn("relative inline-flex shrink-0 items-center gap-1 text-[13px] text-ink-3 [&_select]:outline-none", className)}>
      Sort by <span className="font-semibold text-ink">{labels[value]}</span>
      <ChevronDown className="size-4 text-ink-2" aria-hidden />
      <select aria-label="Sort by" value={value} onChange={(e) => onChange(e.target.value as T)} className="absolute inset-0 cursor-pointer opacity-0">
        {(Object.keys(labels) as T[]).map((k) => (
          <option key={k} value={k}>
            {labels[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * How many, from where — and the order they're in: the line above the results. One line always: smaller type on a
 * phone, and a summary too long even then ends in "…" with the whole of it on hover.
 */
export function ResultsLine({ summary, sort, pinned = true }: { summary: React.ReactNode; sort?: React.ReactNode; /** From 1024px, stays under Find's pinned search row while the results scroll (not on Saved, which has none). */ pinned?: boolean }) {
  return (
    <div className={cn("mb-3 flex items-center gap-2 whitespace-nowrap sm:gap-3 [&_label]:text-[11.5px] sm:[&_label]:text-[13px]", pinned && FIND_RESULTS_PIN)}>
      <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3 sm:text-[13px]" title={typeof summary === "string" ? summary : undefined}>
        {summary}
      </p>
      {/* From 1024px Sort comes first, before the count (owner, 2026-11-06: "bring this before 'Showing 68..'"). */}
      {sort && <div className="shrink-0 lg:order-first">{sort}</div>}
    </div>
  );
}

/** The results, one column on a phone and up to three on a wide screen. */
export function ResultsGrid({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul className="wj-stagger grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 [&>li]:flex [&>li>*]:min-w-0 [&>li>*]:flex-1" aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * The foot of a results list: Show more while there are more, and Back to top once the list is long enough to scroll
 * (owner, 2026-11-12: "add a go to top button at the bottom").
 */
export function ShowMore({ left, shown, onClick }: { left: number; shown: number; onClick: () => void }) {
  const top = shown > 4;
  if (!left && !top) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {left > 0 && (
        <Button variant="outline" onClick={onClick}>
          Show more ({left} left)
        </Button>
      )}
      {top && (
        <Button
          variant="ghost"
          icon={<ArrowUp className="size-4" aria-hidden />}
          onClick={() => {
            const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
            document.querySelector<HTMLElement>("main h1, main input[type=search]")?.focus({ preventScroll: true });
          }}
        >
          Back to top
        </Button>
      )}
    </div>
  );
}

/** A search in progress: a tinted banner with what's happening, and a progress sweep. */
export function SearchingBanner({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="mb-4 overflow-hidden rounded-2xl border border-brand-300 bg-brand-50">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex shrink-0 flex-col items-center gap-1.5">{aside}</div>
        {children}
      </div>
      <div className="h-1 w-full overflow-hidden bg-brand-200" aria-hidden>
        <div className="wj-sweep h-full w-2/5 rounded-full bg-brand-500" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Result card */

/** The small Apply button under a card's logo. */
export const APPLY_BTN = "wj-gradient-bg wj-press shadow-brand relative z-10 mt-1.5 inline-flex h-8 items-center gap-0.5 rounded-full px-3 text-[12px] font-semibold text-white";

/** A card title's link or button: the whole card is its tap target. */
export const CARD_TARGET = "after:absolute after:inset-0 after:content-['']";

/** The fit pill under a card's logo: a number or word, and a small word under it. */
export function FitPill({ tone, top, bottom, title, srText }: { tone: string; top: React.ReactNode; bottom: string; title: string; srText: string }) {
  return (
    <span className={cn("rounded-[8px] px-1.5 py-0.5 text-center text-[12px] font-semibold leading-none", tone)} title={title}>
      {top}
      <span className="mt-0.5 block text-[10px] font-medium">{bottom}</span>
      <span className="wj-sr-only">, {srText}</span>
    </span>
  );
}

/**
 * The fit as a ring (the premium card): the score fills the ring in the fit's colour, the number sits inside and a small
 * word under it. `color` is a CSS colour (a token).
 */
export function FitRing({ score, color, bottom, title, srText }: { score: number; color: string; bottom: string; title: string; srText: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <span className="flex flex-col items-center leading-none" title={title}>
      <span className="relative grid size-11 place-items-center">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--wj-bg-soft)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
        </svg>
        <span className="text-[12.5px] font-bold tabular-nums text-ink">{score}</span>
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">{bottom}</span>
      <span className="wj-sr-only">%, {srText}</span>
    </span>
  );
}

/** Save at a card's corner. */
export function SaveButton({ saved, onToggle, noun }: { saved: boolean; onToggle: () => void; noun: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : `Save ${noun}`}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg-soft", saved ? "text-brand-600" : "text-ink-2")}
    >
      <Bookmark className="size-5" fill={saved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/**
 * One result: the logo column (`aside`: logo, fit, Apply), the title, one line of facts separated by dots (`facts`,
 * where each module puts its own: Jobs' place, work mode and salary; Internships' place, duration, start and stipend),
 * skills, why it fits, a summary where there's room, then a footer line with Save.
 */

export function ResultCard({ className, premium = true, cover, aside, title, facts, tags = [], reasons = [], summary, summaryTitle, trailing, status, footnote, share, actions, children }: { className?: string; /** The roomier, bolder look (owner, 2026-11-12: Jobs first, then every module); false for the old flat card. */ premium?: boolean; /** Share, in the footer beside Save: what to share, or null where the module draws its own (Jobs). */ share: ListingShareProps | null; aside: React.ReactNode; title: React.ReactNode; facts: React.ReactNode[]; tags?: string[]; reasons?: string[]; summary?: string; summaryTitle?: string; trailing?: React.ReactNode; status?: React.ReactNode; footnote: React.ReactNode; actions?: React.ReactNode; /** A picture across the top of the card (Events' cover), full width; none for most modules. */ cover?: React.ReactNode; children?: React.ReactNode }) {
  const shown = facts.filter((f) => f !== null && f !== undefined && f !== false && f !== "");
  return (
    <article className={cn("relative flex flex-col", premium ? "wj-card-premium p-4 sm:p-5" : "wj-card wj-elevate px-4 py-3", className)}>
      {cover}
      {/* Cards in a row share its height: the body takes the spare room, so every footer sits on the same line. */}
      <div className="flex flex-1 items-stretch gap-3">
        {/* The fit sits under the logo, so the title gets the card's whole width. */}
        <div className="flex shrink-0 flex-col items-center gap-1">{aside}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The title leads (two lines at most); the facts share the line below it. */}
          <h3 className={cn("line-clamp-2 font-semibold leading-snug text-ink", premium ? "text-[16px] tracking-tight" : "text-[15px]")}>{title}</h3>
          <p className={cn("flex flex-wrap items-center text-ink-3", premium ? "mt-1 gap-x-3 gap-y-1 text-[13px]" : "mt-0.5 gap-x-1.5 text-[12.5px]")}>
            {shown.map((f, i) => (
              <Fragment key={i}>
                {i > 0 && !premium && <span aria-hidden>·</span>}
                {/* A fact never runs past three lines (owner, 2026-11-09: a posting listing 150 countries). */}
                <span className="line-clamp-3 min-w-0 break-words">{f}</span>
              </Fragment>
            ))}
          </p>
          {tags.length > 0 && (
            <ul className={cn("flex flex-wrap", premium ? "mt-2.5 gap-1.5" : "mt-1.5 gap-1")} aria-label="Skills">
              {tags.map((t) => (
                <li key={t} className={premium ? "rounded-[8px] border border-line bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-2" : "rounded-full bg-bg-soft px-2.5 py-0.5 text-[12px] text-ink"}>
                  {t}
                </li>
              ))}
            </ul>
          )}
          {reasons.length > 0 && (
            <ul className={cn("flex flex-wrap gap-x-3 gap-y-0.5", premium ? "mt-2.5" : "mt-1.5")} aria-label="Why it fits">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-1 text-[12.5px] text-ink-2">
                  <CheckCircle2 className="size-3.5 shrink-0 fill-success-600 text-white" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {/* Fills whatever room is left beside the logo column — never makes the card taller, and shows only when two lines fit. */}
          {summary && (
            <div className="wj-fill mt-1.5 min-h-0 flex-1" title={summaryTitle}>
              <p className="wj-fill-text text-[12.5px] leading-[1.4] text-ink-3">{summary}</p>
            </div>
          )}
        </div>
        {trailing}
      </div>
      <div className={cn("flex items-center gap-2", premium ? "mt-3 border-t border-line pt-2.5" : "mt-1")}>
        {status}
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4" title={typeof footnote === "string" && footnote !== shortSourceNames(footnote) ? footnote : undefined}>
          {typeof footnote === "string" ? shortSourceNames(footnote) : footnote}
        </span>
        {(share || actions) && (
          <div className="relative z-10 -my-1 -mr-1.5 flex shrink-0 items-center">
            {share && <ListingShare {...share} />}
            {actions}
          </div>
        )}
      </div>
      {children}
    </article>
  );
}
