"use client";
import { useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import type { JobFilters as Filters, JobSort, JobSource, WorkMode } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL } from "@/domain/jobs/jobType";
import { MODE_JOB_TYPES, findModeOf, modeJobTypeLabel } from "@/domain/jobs/findMode";
import { Chip } from "@/components/common/Input";
import { useBottomBar } from "@/wonderworks/chrome/MobileNav";
import { useUIStore } from "@/store/ui";
import { useJobsStore } from "@/store/jobs";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/dictation";
import { ChoiceChips, DictationNotes, FilterBox, PillButton, REFINE_CHIP, RefineCheck, RefineField, RefinePanel, RefinePlaces, RefineSelect, RefineToggle, SearchBox, SearchSubmit, SortSelect, TogglePill, historyFor, refineSectionClass } from "@/wonderworks/find/parts";

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

/** Each mode's own job types (domain/jobs/findMode.ts). */
function JobTypeChips({ filters, onChange, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; className?: string }) {
  const picked = filters.jobTypes ?? [];
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] max-[380px]:gap-0.5", className)}>
      {MODE_JOB_TYPES[findModeOf(filters)].map((t) => (
        <Chip key={t} active={picked.includes(t)} onClick={() => onChange({ jobTypes: picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t] })} className={cn(REFINE_CHIP, "shrink-0")}>
          {modeJobTypeLabel(t, JOB_TYPE_LABEL[t])}
        </Chip>
      ))}
    </div>
  );
}

const splitPlaces = (text: string) => text.split(",").map((p) => p.trim()).filter(Boolean);

/**
 * How many of Refine's settings differ from where they start — one per setting. At their start (count 0): the
 * view All, no job type, All modes (none or all three), Any salary, no places picked, no level, Posted any time,
 * every source and Hide Pipeline off. Sort is beside the job count, not in Refine.
 */
const refineCount = (f: Filters, profilePlaces?: string[]) =>
  [f.minFit, f.jobTypes?.length, f.workModes.length > 0 && f.workModes.length < Object.keys(WORK_MODE_LABEL).length, f.minSalary, f.skipProfile ? f.locations?.length : placesChanged(f.locations, profilePlaces), f.levels?.length, f.freshnessDays, f.sourceIds.length, f.hideInPipeline].filter(Boolean).length;

/** Full Time's places count only when they differ from the Career Profile's own (in any order). */
const placesChanged = (picked: string[] | undefined, profile: string[] | undefined) => picked !== undefined && (!profile || [...picked].map((p) => p.toLowerCase()).sort().join("|") !== [...profile].map((p) => p.toLowerCase()).sort().join("|"));

/** Opens and closes Find's Refine panel: the first control in the row under Looking for / the search box. */
export function RefineButton({ count: shown, className }: { /** What's set now, as the open panel shows it; defaults to the saved filters. */ count?: number; className?: string }) {
  const more = useUIStore((s) => s.refineOpen);
  const setMore = useUIStore((s) => s.setRefineOpen);
  const saved = useJobsStore((s) => refineCount(s.filters));
  return <RefineToggle open={more} count={shown ?? saved} onToggle={() => setMore((m) => !m)} className={className} />;
}

const SALARY_LAKH = [5, 10, 20, 30, 50];
const lakh = (n: number) => Math.round(n / 100_000);
type RefineSection = "location" | "salary";
const SORT_LABEL: Record<JobSort, string> = { best_match: "Relevance", date: "Newest", salary: "Salary" };

/** "Sort by Relevance ▾" — beside the line that says how many jobs are shown. */
export function SortMenu({ className }: { className?: string }) {
  const sort = useJobsStore((s) => s.sort);
  const setSort = useJobsStore((s) => s.setSort);
  return <SortSelect value={sort} labels={SORT_LABEL} onChange={setSort} className={className} />;
}

/** Easy Apply works only on jobs posted on WonderJobs: the "WonderJobs employers" source. */
export const EASY_APPLY_SOURCE = "employers";
export const easyApplyOnly = (sourceIds: string[]) => sourceIds.length === 1 && sourceIds[0] === EASY_APPLY_SOURCE;

/**
 * Full Time searches the Career Profile (Looking for, on the page); Part Time what's typed in its box
 * (typing narrows the jobs already found; Enter searches every source for it, in those places). Under
 * either, one row: Refine, Location, Salary and the round search button. Everything else — views, job
 * types, level, work mode, freshness, compare — is in Refine; sort sits beside the job count (SortMenu).
 * The mode is the slider above the page (domain/jobs/findMode.ts).
 */
export function JobFiltersBar({ filters, onChange, views = true, compare, onCompare, sourceSearch, refineTop, searchAs, shortlist, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sources?: JobSource[]; views?: boolean; compare: boolean; onCompare: (on: boolean) => void; sourceSearch?: SourceSearch; /** What was searched and "Search as" — first thing in Refine. */ refineTop?: React.ReactNode; /** A "Search as" role other than My profile is picked: one more setting, and Clear puts My profile back. */ searchAs?: { set: boolean; clear: () => void }; /** Saved: the box only filters the jobs already saved, as you type — no source search, no Refine. */ shortlist?: { text: string; onText: (text: string) => void }; className?: string }) {
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
  // Salary's choices, and the one set now if it isn't among them.
  const salaryOptions = [...new Set([...SALARY_LAKH, ...(filters.minSalary ? [lakh(filters.minSalary)] : [])])].sort((x, y) => x - y);
  // The places the next search uses (Refine's, else Full Time's Career Profile places): the first and how
  // many more, so the pill stays short enough to read whole on a phone. None is anywhere, as the search does.
  const placesNow = splitPlaces(where);
  const placesShown = !placesNow.length ? "Anywhere" : placesNow.length > 1 ? `${placesNow[0]} +${placesNow.length - 1}` : placesNow[0];
  const salaryShown = filters.minSalary ? `₹${lakh(filters.minSalary)}L+` : "Any salary";
  // Location and Salary open Refine at their own section: scrolled to, focused and lit for a moment.
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
  const sectionClass = (at: RefineSection) => refineSectionClass(section === at);
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
  // What's set now, counting places picked here before Save and a "Search as" role.
  const activeCount = refineCount({ ...filters, locations: pickedPlaces() }, sourceSearch?.places) + (searchAs?.set ? 1 : 0);
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
    <div className={cn("flex flex-col gap-2", className)}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBoxFocused(false);
          submit();
        }}
      >
        {partTime && (
          <SearchBox
            value={draft}
            onValue={setDraft}
            onClear={() => {
              setDraft("");
              if (filters.query) onChange({ query: "" });
            }}
            placeholder="Search jobs, skills or companies"
            label="Search jobs"
            dictation={dictation}
            dictateLabel="what you're looking for"
            focused={boxFocused}
            onFocused={setBoxFocused}
            history={history}
            onPick={(t) => {
              setDraft(t);
              setBoxFocused(false);
              (document.activeElement as HTMLElement | null)?.blur();
              submit(t);
            }}
            onForget={(t) => forgetSearch(t)}
          />
        )}
        {/* Refine, location, pay and the search — one row, the same in both modes. */}
        <div className="flex items-center gap-2">
          <RefineButton count={activeCount} />
          <PillButton label="Location" shown={placesShown} open={more} onClick={() => openAt("location")} className="min-w-0 flex-auto" />
          <PillButton label="Salary" shown={salaryShown} open={more} onClick={() => openAt("salary")} className="shrink-0" />
          <SearchSubmit label={partTime || !sourceSearch ? "Search" : "Search based on Career Profile"} />
        </div>
      </form>
      {partTime && needWordsFor !== null && needWordsFor === draft.trim() && <p role="alert" className="-mt-1 text-[12px] text-danger-600">Type the work you&apos;re looking for — Part Time searches only your words.</p>}
      <DictationNotes dictation={dictation} hint="Listening — say the role and where, e.g. “IAM director roles in Mumbai”." />
      {more && (
        <RefinePanel
          backLabel="Back to jobs"
          onBack={() => setMore(false)}
          // Easy Apply is for jobs companies posted on WonderJobs, so this narrows the list to that one source.
          corner={<RefineCheck label="Easy Apply only" title="Only jobs you can send with Easy Apply" checked={easyApplyOnly(filters.sourceIds)} onChange={(on) => onChange({ sourceIds: on ? [EASY_APPLY_SOURCE] : [] })} />}
          top={refineTop}
          onSave={() => {
            commit();
            setMore(false);
          }}
          links={
            <>
              <button type="button" onClick={() => onCompare(!compare)} aria-pressed={compare} className="inline-flex min-h-8 items-center gap-1.5 font-medium text-brand-600 hover:underline">
                <GitCompareArrows className="size-3.5" aria-hidden /> {compare ? "Stop comparing" : "Compare jobs"}
              </button>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Everything back to where the mode starts: places too (Full Time's follow the profile again).
                    onChange({ minFit: null, exactFit: false, workModes: [], levels: [], jobTypes: [], company: "", salaryListed: false, strictProfile: false, hideInPipeline: false, sourceIds: [], freshnessDays: null, minSalary: undefined, locations: filters.skipProfile ? [] : undefined });
                    setWhere((filters.skipProfile ? [] : (sourceSearch?.places ?? [])).join(", "));
                    if (searchAs?.set) searchAs.clear();
                    useJobsStore.getState().setSort("best_match");
                  }}
                  className="inline-flex min-h-8 items-center font-medium text-ink-3 hover:text-ink hover:underline"
                >
                  Clear refinements
                </button>
              )}
            </>
          }
        >
          {/* Show and Posted share a row: both are short. */}
          <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-3">
            {views && (
              <RefineField label="Show" className="min-w-0 flex-1">
                <ChoiceChips options={VIEWS.map((v) => ({ ...v, isDefault: v.value === "all" }))} value={view} onPick={(v) => onChange(VIEW_PATCH[v])} />
              </RefineField>
            )}
            <RefineSelect label="Posted" value={String(filters.freshnessDays ?? "")} onChange={(v) => onChange({ freshnessDays: v ? Number(v) : null })} options={POSTED} />
          </div>
          <RefineField label="Job type">
            <JobTypeChips filters={filters} onChange={onChange} className="flex-wrap overflow-visible" />
          </RefineField>
          {/* Work mode, with Hide Pipeline beside it (jobs you're already preparing, have applied to or are interviewing for). */}
          <div className="flex items-end gap-3">
            <div role="group" aria-label="Work mode" className={cn(refineSectionClass(false), "min-w-0 flex-1")}>
              Work mode
              <div className="flex flex-wrap gap-1">
                {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                  <Chip key={m} active={filters.workModes.includes(m)} isDefault={filters.workModes.length === Object.keys(WORK_MODE_LABEL).length} onClick={() => onChange({ workModes: filters.workModes.includes(m) ? filters.workModes.filter((x) => x !== m) : [...filters.workModes, m] })} className={REFINE_CHIP}>
                    {WORK_MODE_LABEL[m]}
                  </Chip>
                ))}
              </div>
            </div>
            <RefineCheck label="Hide Pipeline" title="Hide jobs you're already applying to" checked={!!filters.hideInPipeline} onChange={(on) => onChange({ hideInPipeline: on })} className="min-h-7" />
          </div>
          <div id="wj-refine-salary" role="group" aria-label="Salary" tabIndex={-1} className={sectionClass("salary")}>
            Salary
            <ChoiceChips options={[{ value: -1, label: "Any", isDefault: true }, ...salaryOptions.map((l) => ({ value: l, label: <>₹{l}L+</> }))]} value={filters.minSalary ? lakh(filters.minSalary) : -1} onPick={(l) => onChange({ minSalary: l < 0 ? undefined : l * 100_000 })} />
          </div>
          <div id="wj-refine-location" role="group" aria-label="Location" tabIndex={-1} className={sectionClass("location")}>
            <RefinePlaces places={placesNow} onChange={(list) => setWhere(list.join(", "))} />
          </div>
          <RefineField label="Level">
            <div className="flex flex-wrap gap-1">
              {LEVELS.map((l) => (
                <Chip key={l.value} active={!!filters.levels?.includes(l.value)} onClick={() => onChange({ levels: filters.levels?.includes(l.value) ? filters.levels.filter((x) => x !== l.value) : [...(filters.levels ?? []), l.value] })} className={REFINE_CHIP}>
                  {l.label}
                </Chip>
              ))}
            </div>
          </RefineField>
        </RefinePanel>
      )}
    </div>
  );
}

const POSTED = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last week" },
  { value: "30", label: "Last month" },
];

/** Saved's own filter row (Saved has no Refine): the words narrow the saved jobs as they're typed; the job types and Hide Pipeline. */
function ShortlistFilters({ text, onText, filters, onChange, className }: { text: string; onText: (t: string) => void; filters: Filters; onChange: (patch: Partial<Filters>) => void; className?: string }) {
  const dictation = useDictation({ textAtStart: () => text, onText });
  const recent = useJobsStore((s) => s.recentSavedSearches);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <FilterBox text={text} onText={onText} label="Filter saved jobs" dictation={dictation} dictateLabel="what to look for in your saved jobs" history={recent} onEnter={(t) => useJobsStore.getState().rememberSearch(t, "saved")} onForget={(t) => useJobsStore.getState().forgetSearch(t, "saved")} />
      <JobTypeChips filters={filters} onChange={onChange} />
      <div className="flex flex-wrap gap-2">
        <TogglePill label="Hide Pipeline" checked={!!filters.hideInPipeline} onChange={(on) => onChange({ hideInPipeline: on })} />
        <TogglePill label="Easy Apply only" title="Only saved jobs you can send with Easy Apply" checked={!!filters.savedEasyApply} onChange={(on) => onChange({ savedEasyApply: on })} />
      </div>
    </div>
  );
}
