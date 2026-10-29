"use client";
import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, CheckCircle2, ChevronDown, History, Search, SlidersHorizontal, X } from "lucide-react";
import { Chip, Input, Select } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { DictateButton } from "@/components/common/DictateButton";
import { PlaceInput } from "@/components/common/PlaceInput";
import type { Dictation } from "@/lib/dictation";
import { cn } from "@/lib/cn";

/**
 * Find's building blocks, shared by every WonderWorks module (docs/WONDERSTAR_PLATFORM.md §4.1): the search box, the
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

/** The search box: the magnifier, the words, clear and the microphone, and the recent searches while it has focus. */
export function SearchBox({ value, onValue, onClear, placeholder, label, dictation, dictateLabel, focused, onFocused, history, onPick, onForget }: { value: string; onValue: (text: string) => void; onClear: () => void; placeholder: string; label: string; dictation: Dictation; dictateLabel: string; focused: boolean; onFocused: (on: boolean) => void; history: string[]; onPick: (t: string) => void; onForget: (t: string) => void }) {
  return (
    <div className="relative min-w-0">
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
export function FilterBox({ text, onText, label, dictation, dictateLabel, history, onEnter, onForget }: { text: string; onText: (t: string) => void; label: string; dictation: Dictation; dictateLabel: string; history: string[]; onEnter: (t: string) => void; onForget: (t: string) => void }) {
  const [focused, setFocused] = useState(false);
  const enter = (t = text) => {
    onEnter(t);
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <form
      className="relative min-w-0"
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
export function SearchSubmit({ label }: { label: string }) {
  return (
    <button type="submit" aria-label={label} title={label} className="wj-gradient-bg grid size-10 shrink-0 place-items-center rounded-full text-white shadow-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
      <ArrowRight className="size-5" aria-hidden />
    </button>
  );
}

/** A Refine section the row's pills open: scrolled to, focused and lit for a moment. */
export const refineSectionClass = (lit: boolean) => cn("-m-1.5 flex flex-col gap-1 rounded-[12px] p-1.5 text-[13px] font-medium text-ink-2 outline-none transition-shadow", lit && "ring-2 ring-brand-400 bg-brand-50/60");

/**
 * The Refine panel: "Back to …" and one corner option, the module's own top (e.g. "Search as"), its fields, one Save,
 * and a line of links under it.
 */
export function RefinePanel({ backLabel, onBack, corner, top, children, onSave, links }: { backLabel: string; onBack: () => void; corner?: React.ReactNode; top?: React.ReactNode; children: React.ReactNode; onSave: () => void; links?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-[16px] border border-line bg-surface px-3 py-2.5 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="-mb-1 flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
        {/* Back to the list without changing anything typed here. */}
        <button type="button" onClick={onBack} className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
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

/** How many, from where — and the order they're in: the line above the results. */
export function ResultsLine({ summary, sort }: { summary: React.ReactNode; sort?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <p className="min-w-0 flex-1 text-[13px] text-ink-3">{summary}</p>
      {sort}
    </div>
  );
}

/** The results, one column on a phone and up to three on a wide screen. */
export function ResultsGrid({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {children}
    </ul>
  );
}

export function ShowMore({ left, onClick }: { left: number; onClick: () => void }) {
  return (
    <div className="mt-5 flex justify-center">
      <Button variant="outline" onClick={onClick}>
        Show more ({left} left)
      </Button>
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
export const APPLY_BTN = "wj-gradient-bg wj-press relative z-10 mt-1 inline-flex h-7 items-center gap-0.5 rounded-full px-2.5 text-[12px] font-semibold text-white";

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
export function ResultCard({ className, aside, title, facts, tags = [], reasons = [], summary, summaryTitle, trailing, status, footnote, actions, children }: { className?: string; aside: React.ReactNode; title: React.ReactNode; facts: React.ReactNode[]; tags?: string[]; reasons?: string[]; summary?: string; summaryTitle?: string; trailing?: React.ReactNode; status?: React.ReactNode; footnote: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  const shown = facts.filter((f) => f !== null && f !== undefined && f !== false && f !== "");
  return (
    <article className={cn("wj-card wj-elevate relative flex flex-col px-4 py-3", className)}>
      <div className="flex items-stretch gap-3">
        {/* The fit sits under the logo, so the title gets the card's whole width. */}
        <div className="flex shrink-0 flex-col items-center gap-1">{aside}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The title leads (two lines at most); the facts share the line below it. */}
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
            {shown.map((f, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {f}
              </Fragment>
            ))}
          </p>
          {tags.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Skills">
              {tags.map((t) => (
                <li key={t} className="rounded-full bg-bg-soft px-2.5 py-0.5 text-[12px] text-ink">
                  {t}
                </li>
              ))}
            </ul>
          )}
          {reasons.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" aria-label="Why it fits">
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
      <div className="mt-1 flex items-center gap-2">
        {status}
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">{footnote}</span>
        {actions && <div className="relative z-10 -my-1 -mr-1.5 flex shrink-0 items-center">{actions}</div>}
      </div>
      {children}
    </article>
  );
}
