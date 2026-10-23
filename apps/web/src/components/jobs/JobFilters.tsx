"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, GitCompareArrows, History, Search, SlidersHorizontal, X } from "lucide-react";
import type { JobFilters as Filters, JobSort, JobSource, WorkMode } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL } from "@/domain/jobs/jobType";
import { MODE_JOB_TYPES, findModeOf, modeJobTypeLabel } from "@/domain/jobs/findMode";
import { Chip, Input, Select } from "@/components/common/Input";
import { useBottomBar } from "@/components/navigation/MobileNav";
import { useUIStore } from "@/store/ui";
import { useJobsStore } from "@/store/jobs";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/dictation";
import { DictateButton } from "@/components/common/DictateButton";
import { PlaceInput } from "@/components/common/PlaceInput";

export type JobsView = "for_you" | "strong" | "all" | "saved";
// Saved is its own tab, not a view here.
// All comes first: it's where Find opens; Strong and For you narrow it to the better fits (owner, 2026-10-22: Strong first).
const VIEWS: { value: JobsView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "strong", label: "Strong" },
  { value: "for_you", label: "For you" },
];

/** Which view a set of filters is — views are presets over the same filters, so they can't disagree with Refine or "Why was this filtered". */
export const viewOf = (f: Filters): JobsView => (f.onlySaved ? "saved" : f.minFit === "strong" ? "strong" : f.minFit === "worth_considering" ? "for_you" : "all");
export const VIEW_PATCH: Record<JobsView, Partial<Filters>> = {
  for_you: { onlySaved: false, minFit: "worth_considering", exactFit: false },
  strong: { onlySaved: false, minFit: "strong", exactFit: false },
  all: { onlySaved: false, minFit: null, exactFit: false },
  saved: { onlySaved: true },
};

export interface SourceSearch {
  /** Search every source for what was typed, in the places given (the Where field). */
  run: (text: string, places: string[]) => void;
  /** What that search would look for, in plain words ("“data analyst” in Pune"); null when no role can be read. */
  describe: (text: string, places: string[]) => string | null;
  /** The profile's places — what Where starts as. */
  places: string[];
  /** Search every source again for the profile's own role, in these places (Refine's Search with nothing typed). */
  runPlaces: (places: string[]) => void;
}

const LEVELS: { value: NonNullable<Filters["levels"]>[number]; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "director", label: "Director+" },
];

/** The last few searches under a box while it has focus: a tap uses one, × forgets it. */
function RecentSearches({ items, onPick, onForget }: { items: string[]; onPick: (t: string) => void; onForget: (t: string) => void }) {
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

/** What's typed, against a history: the ones containing it, not itself. */
const historyFor = (items: string[], text: string) => {
  const now = text.trim().toLowerCase();
  return items.filter((t) => t.toLowerCase() !== now && (!now || t.toLowerCase().includes(now)));
};

/** Refine's chips: small enough that each group fits one line on a phone. */
const REFINE_CHIP = "h-8 px-2.5 text-[12px] max-[400px]:px-2";

/** Each mode's own job types (domain/jobs/findMode.ts). */
function JobTypeChips({ filters, onChange, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; className?: string }) {
  const picked = filters.jobTypes ?? [];
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]", className)}>
      {MODE_JOB_TYPES[findModeOf(filters)].map((t) => (
        <Chip key={t} active={picked.includes(t)} onClick={() => onChange({ jobTypes: picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t] })} className={cn(REFINE_CHIP, "shrink-0")}>
          {modeJobTypeLabel(t, JOB_TYPE_LABEL[t])}
        </Chip>
      ))}
    </div>
  );
}

const splitPlaces = (text: string) => text.split(",").map((p) => p.trim()).filter(Boolean);

/** How many of Refine's settings are changed from where they start — one per setting (view, job types, work
 * mode, salary, places, level, posted, sources, Hide Pipeline, strictly within the profile, sort). */
const refineCount = (f: Filters, sort: JobSort) =>
  [f.minFit, f.jobTypes?.length, f.workModes.length, f.minSalary, f.skipProfile ? f.locations?.length : f.locations !== undefined, f.levels?.length, f.freshnessDays, f.sourceIds.length, f.hideInPipeline, f.strictProfile, sort !== "best_match"].filter(Boolean).length;

const PILL = "relative flex h-12 min-w-0 items-center rounded-full border border-line bg-surface text-[15px] text-ink shadow-xs transition-colors hover:border-ink-4/40";

/** Opens and closes Find's Refine panel: the first control in the row under Looking for / the search box. */
export function RefineButton({ className }: { className?: string }) {
  const more = useUIStore((s) => s.refineOpen);
  const setMore = useUIStore((s) => s.setRefineOpen);
  const count = useJobsStore((s) => refineCount(s.filters, s.sort));
  return (
    <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-label={`Refine${count ? `, ${count} set` : ""}`} title="Refine" className={cn(PILL, "shrink-0 gap-2.5 px-4 font-semibold max-[380px]:px-3", more && "border-brand-200 bg-brand-50", className)}>
      <SlidersHorizontal className="size-5" aria-hidden />
      {count ? <span>{count}</span> : null}
    </button>
  );
}

/** A pill that opens Refine at its own section, labelled with what's picked there. */
function PillButton({ label, shown, open, onClick, className }: { label: string; shown: string; open: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${shown}`} aria-expanded={open} className={cn(PILL, "gap-1 pl-3.5 pr-2.5 text-left text-[14px] max-[430px]:pl-2.5 max-[430px]:pr-1.5 max-[430px]:text-[12.5px]", className)}>
      <span className="min-w-0 flex-1 truncate">{shown}</span>
      <ChevronDown className="size-4 shrink-0 text-ink-2 max-[430px]:size-3.5" aria-hidden />
    </button>
  );
}

const SALARY_LAKH = [5, 10, 20, 30, 50];
const lakh = (n: number) => Math.round(n / 100_000);
type RefineSection = "work_mode" | "salary";
const SORT_LABEL: Record<JobSort, string> = { best_match: "Relevance", date: "Newest", salary: "Salary" };

/** "Sort by Relevance ▾" — beside the line that says how many jobs are shown. */
export function SortMenu({ className }: { className?: string }) {
  const sort = useJobsStore((s) => s.sort);
  const setSort = useJobsStore((s) => s.setSort);
  return (
    <label className={cn("relative inline-flex shrink-0 items-center gap-1 text-[13px] text-ink-3 [&_select]:outline-none", className)}>
      Sort by <span className="font-semibold text-ink">{SORT_LABEL[sort]}</span>
      <ChevronDown className="size-4 text-ink-2" aria-hidden />
      <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as JobSort)} className="absolute inset-0 cursor-pointer opacity-0">
        {(Object.keys(SORT_LABEL) as JobSort[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABEL[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Full Time searches the Career Profile (Looking for, on the page); Part Time what's typed in its box
 * (typing narrows the jobs already found; Enter searches every source for it, in those places). Under
 * either, one row: Refine, Location, Salary and the round search button. Everything else — views, job
 * types, level, work mode, freshness, compare — is in Refine; sort sits beside the job count (SortMenu).
 * The mode is the slider above the page (domain/jobs/findMode.ts).
 */
export function JobFiltersBar({ filters, onChange, views = true, compare, onCompare, sourceSearch, refineTop, shortlist, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sources?: JobSource[]; views?: boolean; compare: boolean; onCompare: (on: boolean) => void; sourceSearch?: SourceSearch; /** What was searched and "Search as" — first thing in Refine. */ refineTop?: React.ReactNode; /** Saved: the box only filters the jobs already saved, as you type — no source search, no Refine. */ shortlist?: { text: string; onText: (text: string) => void }; className?: string }) {
  const more = useUIStore((s) => s.refineOpen);
  const setMore = useUIStore((s) => s.setRefineOpen);
  // Refine is Find's own panel: leaving Find closes it.
  useEffect(() => () => setMore(false), [setMore]);
  useBottomBar(more);
  // Typing only changes the box; Search (or Enter) applies the words. Kept in step when something else
  // changes them (a link with ?q=, "clear" in the list).
  const [draft, setDraft] = useState(filters.query);
  // Part Time with nothing searchable typed: say what's needed instead of searching the profile. Kept with
  // the words it was said for, so it goes the moment the box changes (typed, picked or dictated).
  const [needWordsFor, setNeedWordsFor] = useState<string | null>(null);
  const [seenQuery, setSeenQuery] = useState(filters.query);
  if (seenQuery !== filters.query) {
    setSeenQuery(filters.query);
    setDraft(filters.query);
  }
  // Say it instead of typing it: the words land in the box, to fix before pressing Search.
  const dictation = useDictation({ textAtStart: () => draft, onText: setDraft });
  const places = filters.locations ?? sourceSearch?.places ?? [];
  const [where, setWhere] = useState(places.join(", "));
  // Where shows the profile's places until others are picked (`locations` undefined: Full Time's "your
  // Career Profile's places", so a profile change still flows through), and follows the filter when something
  // else changes it (Clear, Show me anyway, switching modes).
  const [seen, setSeen] = useState(filters.locations);
  if (seen !== filters.locations) {
    setSeen(filters.locations);
    const now = (filters.locations ?? sourceSearch?.places ?? []).join(", ");
    if (splitPlaces(now).join("|") !== splitPlaces(where).join("|")) setWhere(now);
  }
  const sort = useJobsStore((s) => s.sort);
  const activeCount = refineCount(filters, sort);
  // Salary's choices, and the one set now if it isn't among them.
  const salaryOptions = [...new Set([...SALARY_LAKH, ...(filters.minSalary ? [lakh(filters.minSalary)] : [])])].sort((x, y) => x - y);
  // All three picked reads "All modes", so the pill stays short enough to read whole on a phone.
  // None picked is any: the pills say so, as the search does.
  const workModesShown = !filters.workModes.length || filters.workModes.length >= Object.keys(WORK_MODE_LABEL).length ? "All modes" : filters.workModes.map((m) => WORK_MODE_LABEL[m]).join(", ");
  const salaryShown = filters.minSalary ? `₹${lakh(filters.minSalary)}L+` : "Any salary";
  // Work mode and Salary open Refine at their own section: scrolled to, focused and lit for a moment.
  const [section, setSection] = useState<RefineSection | null>(null);
  const openAt = (at: RefineSection) => {
    setMore(true);
    setSection(at);
  };
  useEffect(() => {
    if (!more || !section) return;
    const el = document.getElementById(`wj-refine-${section}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
    const t = setTimeout(() => setSection(null), 1600);
    return () => clearTimeout(t);
  }, [more, section]);
  const sectionClass = (at: RefineSection) => cn("-m-2 flex flex-col gap-1.5 rounded-[12px] p-2 text-[13px] font-medium text-ink-2 outline-none transition-shadow", section === at && "ring-2 ring-brand-400 bg-brand-50/60");
  const view = viewOf(filters);
  const partTime = findModeOf(filters) === "part_time";
  // Part Time's last few searches, under the box while it has focus; one tap searches again.
  const recentSearches = useJobsStore((s) => s.recentSearches);
  const forgetSearch = useJobsStore((s) => s.forgetSearch);
  const [boxFocused, setBoxFocused] = useState(false);
  const history = historyFor(recentSearches, draft);
  // Applies what's in the box and the Where field to the list.
  const pickedPlaces = () => {
    const picked = splitPlaces(where);
    // Unchanged from the profile's places: keep following the profile rather than saving a copy of them.
    return filters.locations === undefined && picked.join("|") === (sourceSearch?.places ?? []).join("|") ? undefined : picked;
  };
  const commit = (text = draft) => onChange({ query: text, locations: pickedPlaces() });
  // Search: Part Time the typed words (or a history item's), Full Time the Career Profile's own search.
  const submit = (text = draft) => {
    if (partTime) commit(text);
    else onChange({ query: "", locations: pickedPlaces() });
    // Words searched: every source too, not only the jobs already on screen.
    // Full Time has no box: it is always the Career Profile's own search.
    const words = partTime ? text.trim() : "";
    // Part Time: only typed words are searched — nothing typed is asked for, not filled in from the profile.
    if (filters.skipProfile && (!words || !sourceSearch?.describe(words, splitPlaces(where)))) {
      setNeedWordsFor(text.trim());
      return;
    }
    setNeedWordsFor(null);
    if (words && sourceSearch?.describe(words, splitPlaces(where))) {
      if (partTime) useJobsStore.getState().rememberSearch(words);
      sourceSearch.run(words, splitPlaces(where));
    } else if (!words) sourceSearch?.runPlaces(splitPlaces(where));
  };
  if (shortlist) return <ShortlistFilters text={shortlist.text} onText={shortlist.onText} filters={filters} onChange={onChange} className={className} />;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBoxFocused(false);
          submit();
        }}
      >
        {partTime && (
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (dictation.listening) dictation.rebase(e.target.value);
            }}
            onFocus={() => setBoxFocused(true)}
            onBlur={() => setBoxFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBoxFocused(false);
            }}
            placeholder="Search jobs, skills or companies"
            aria-label="Search jobs"
            enterKeyHint="search"
            className={cn("h-12 rounded-full pl-10", dictation.supported ? "pr-20" : "pr-10")}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {draft && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("");
                  if (filters.query) onChange({ query: "" });
                }}
                className="rounded-full p-2 text-ink-4 hover:bg-bg-soft hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
            {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label="what you're looking for" />}
          </div>
          {boxFocused && (
            <RecentSearches
              items={history}
              onPick={(t) => {
                setDraft(t);
                setBoxFocused(false);
                (document.activeElement as HTMLElement | null)?.blur();
                submit(t);
              }}
              onForget={(t) => forgetSearch(t)}
            />
          )}
        </div>
        )}
        {/* Refine, work mode, pay and the search — one row, the same in both modes. */}
        <div className="flex items-center gap-2">
          <RefineButton />
          <PillButton label="Work mode" shown={workModesShown} open={more} onClick={() => openAt("work_mode")} className="min-w-0 flex-auto" />
          <PillButton label="Salary" shown={salaryShown} open={more} onClick={() => openAt("salary")} className="shrink-0" />
          <button type="submit" aria-label={partTime || !sourceSearch ? "Search" : "Search based on Career Profile"} title={partTime || !sourceSearch ? "Search" : "Search based on Career Profile"} className="wj-gradient-bg grid size-12 shrink-0 place-items-center rounded-full text-white shadow-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            <ArrowRight className="size-6" aria-hidden />
          </button>
        </div>
      </form>
      {partTime && needWordsFor !== null && needWordsFor === draft.trim() && <p role="alert" className="-mt-1 text-[12px] text-danger-600">Type the work you&apos;re looking for — Part Time searches only your words.</p>}
      {dictation.listening && <p aria-live="polite" className="-mt-1 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : "Listening — say the role and where, e.g. “IAM director roles in Mumbai”."}</p>}
      {dictation.error && <p role="alert" className="-mt-1 text-[12px] text-danger-600">{dictation.error}</p>}
      {more && (
        <div className="grid grid-cols-1 gap-4 rounded-[16px] border border-line bg-surface p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 [&>*]:min-w-0">
          {/* Back to the list without changing anything typed here. */}
          <button type="button" onClick={() => setMore(false)} className="-mb-1 inline-flex min-h-9 items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink sm:col-span-2 lg:col-span-3">
            <ArrowLeft className="size-4" aria-hidden /> Back to jobs
          </button>
          {refineTop && <div className="border-b border-line pb-3 sm:col-span-2 lg:col-span-3 [&>*:last-child]:mb-0">{refineTop}</div>}
          {views && (
            <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Show
              <div className="flex flex-wrap gap-1">
                {VIEWS.map((v) => (
                  <Chip key={v.value} active={view === v.value} onClick={() => onChange(VIEW_PATCH[v.value])} className={REFINE_CHIP}>
                    {v.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Job type
            <JobTypeChips filters={filters} onChange={onChange} className="flex-wrap overflow-visible" />
          </div>
          <div id="wj-refine-work_mode" role="group" aria-label="Work mode" tabIndex={-1} className={sectionClass("work_mode")}>
            Work mode
            <div className="flex flex-wrap gap-1">
              {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                <Chip key={m} active={filters.workModes.includes(m)} onClick={() => onChange({ workModes: filters.workModes.includes(m) ? filters.workModes.filter((x) => x !== m) : [...filters.workModes, m] })} className={REFINE_CHIP}>
                  {WORK_MODE_LABEL[m]}
                </Chip>
              ))}
            </div>
          </div>
          <div id="wj-refine-salary" role="group" aria-label="Salary" tabIndex={-1} className={sectionClass("salary")}>
            Salary
            <div className="flex flex-wrap gap-1">
              <Chip active={!filters.minSalary} onClick={() => onChange({ minSalary: undefined })} className={REFINE_CHIP}>
                Any
              </Chip>
              {salaryOptions.map((l) => (
                <Chip key={l} active={!!filters.minSalary && lakh(filters.minSalary) === l} onClick={() => onChange({ minSalary: l * 100_000 })} className={REFINE_CHIP}>
                  ₹{l}L+
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            <span aria-hidden>Location</span>
            {/* Real places worldwide as you type; each picked one a pill, as many as wanted. */}
            <PlaceInput label="Location" places={splitPlaces(where)} onChange={(list) => setWhere(list.join(", "))} placeholder={splitPlaces(where).some((p) => !/^remote$/i.test(p)) ? "Add another place" : "Anywhere — e.g. Dubai"} />
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Level
            <div className="flex flex-wrap gap-1">
              {LEVELS.map((l) => (
                <Chip key={l.value} active={!!filters.levels?.includes(l.value)} onClick={() => onChange({ levels: filters.levels?.includes(l.value) ? filters.levels.filter((x) => x !== l.value) : [...(filters.levels ?? []), l.value] })} className={REFINE_CHIP}>
                  {l.label}
                </Chip>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Posted
            <Select value={filters.freshnessDays ?? ""} onChange={(e) => onChange({ freshnessDays: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="7">Last week</option>
              <option value="30">Last month</option>
            </Select>
          </label>
          {/* Jobs you're already preparing, have applied to or are interviewing for. */}
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-ink sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-brand-600)]" checked={!!filters.hideInPipeline} onChange={(e) => onChange({ hideInPipeline: e.target.checked })} />
            <span>Hide Pipeline: jobs you&apos;re already applying to</span>
          </label>
          {!partTime && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-ink sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-brand-600)]" checked={!!filters.strictProfile} onChange={(e) => onChange({ strictProfile: e.target.checked })} />
            <span>
              Search strictly within your{" "}
              <Link href="/app/career-dna" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                Career Profile
              </Link>
            </span>
          </label>
          )}
          {/* One action: keep what's set here and go back to the list. */}
          <div className="sticky bottom-[calc(var(--wj-mobile-nav-h)+0.5rem)] flex flex-wrap items-center gap-2 border-t border-line bg-surface pt-3 sm:col-span-2 md:bottom-2 lg:col-span-3">
            <Button
              className="min-w-0 flex-1 sm:flex-none"
              onClick={() => {
                commit();
                setMore(false);
              }}
            >
              Save
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 text-[13px] sm:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => onCompare(!compare)} aria-pressed={compare} className="inline-flex min-h-9 items-center gap-1.5 font-medium text-brand-600 hover:underline">
              <GitCompareArrows className="size-3.5" aria-hidden /> {compare ? "Stop comparing" : "Compare jobs"}
            </button>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  // Everything back to where the mode starts: places too (Full Time's follow the profile again).
                  onChange({ minFit: null, exactFit: false, workModes: [], levels: [], jobTypes: [], company: "", salaryListed: false, strictProfile: false, hideInPipeline: false, sourceIds: [], freshnessDays: null, minSalary: undefined, locations: filters.skipProfile ? [] : undefined });
                  useJobsStore.getState().setSort("best_match");
                }}
                className="inline-flex min-h-9 items-center font-medium text-ink-3 hover:text-ink hover:underline"
              >
                Clear refinements
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Saved's own filter row (Saved has no Refine): the words narrow the saved jobs as they're typed; the job types and Hide Pipeline. */
function ShortlistFilters({ text, onText, filters, onChange, className }: { text: string; onText: (t: string) => void; filters: Filters; onChange: (patch: Partial<Filters>) => void; className?: string }) {
  const dictation = useDictation({ textAtStart: () => text, onText });
  const recent = useJobsStore((s) => s.recentSavedSearches);
  const [focused, setFocused] = useState(false);
  // Enter (or the arrow): the words stay as the filter, go into Saved's history and the keyboard closes.
  const enter = (t = text) => {
    useJobsStore.getState().rememberSearch(t, "saved");
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
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
          placeholder="Filter saved jobs"
          aria-label="Filter saved jobs"
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
          {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label="what to look for in your saved jobs" />}
        </div>
        {focused && (
          <RecentSearches
            items={historyFor(recent, text)}
            onPick={(t) => {
              onText(t);
              enter(t);
            }}
            onForget={(t) => useJobsStore.getState().forgetSearch(t, "saved")}
          />
        )}
      </form>
      <JobTypeChips filters={filters} onChange={onChange} />
      <label className={cn("inline-flex h-9 cursor-pointer select-none items-center gap-1.5 self-start rounded-full border px-3 text-[13px] font-medium transition-colors", filters.hideInPipeline ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink")}>
        <input type="checkbox" className="size-3.5 shrink-0 accent-[var(--color-brand-600)]" checked={!!filters.hideInPipeline} onChange={(e) => onChange({ hideInPipeline: e.target.checked })} />
        Hide Pipeline
      </label>
    </div>
  );
}
