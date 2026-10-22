"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitCompareArrows, History, Search, SlidersHorizontal, X } from "lucide-react";
import type { JobFilters as Filters, JobSort, JobSource, WorkMode } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL } from "@/domain/jobs/jobType";
import { MODE_JOB_TYPES, findModeOf, modeJobTypeLabel } from "@/domain/jobs/findMode";
import { Chip, Input, Select, Segmented } from "@/components/common/Input";
import { useBottomBar } from "@/components/navigation/MobileNav";
import { useUIStore } from "@/store/ui";
import { useJobsStore } from "@/store/jobs";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/dictation";
import { DictateButton } from "@/components/common/DictateButton";

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
    <div className={cn("flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]", className)}>
      {MODE_JOB_TYPES[findModeOf(filters)].map((t) => (
        <Chip key={t} active={picked.includes(t)} onClick={() => onChange({ jobTypes: picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t] })} className="h-9 shrink-0 px-3 text-[12.5px]">
          {modeJobTypeLabel(t, JOB_TYPE_LABEL[t])}
        </Chip>
      ))}
    </div>
  );
}

const splitPlaces = (text: string) => text.split(",").map((p) => p.trim()).filter(Boolean);

/**
 * Full Time (the Career Profile's search): one "Search based on Career Profile". Part Time: what to search
 * (typing narrows the jobs already found; Enter searches every source for it, in those places) and the job
 * types. Then one row of views, and everything else — sort, work mode, freshness, salary, sources,
 * compare — in Refine. The mode is the slider above the page (domain/jobs/findMode.ts).
 */
export function JobFiltersBar({ filters, onChange, sort, onSort, total, views = true, compare, onCompare, sourceSearch, showCount = true, refineTop, shortlist, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sort: JobSort; onSort: (s: JobSort) => void; sources?: JobSource[]; total: number; views?: boolean; compare: boolean; onCompare: (on: boolean) => void; sourceSearch?: SourceSearch; /** The job count beside Refine (off when the list says it in its own line). */ showCount?: boolean; /** What was searched and "Search as" — first thing in Refine. */ refineTop?: React.ReactNode; /** Saved: the box only filters the jobs already saved, as you type — no source search, no Refine. */ shortlist?: { text: string; onText: (text: string) => void }; className?: string }) {
  const more = useUIStore((s) => s.refineOpen);
  const setMore = useUIStore((s) => s.setRefineOpen);
  // Refine is Find's own panel: leaving Find closes it.
  useEffect(() => () => setMore(false), [setMore]);
  useBottomBar(more);
  // Typing only changes the box; Search (or Enter) applies the words. Kept in step when something else
  // changes them (a link with ?q=, "clear" in the list).
  const [draft, setDraft] = useState(filters.query);
  // Skip Career Profile with nothing typed: say what's needed instead of searching the profile.
  const [needWords, setNeedWords] = useState(false);
  const [seenQuery, setSeenQuery] = useState(filters.query);
  if (seenQuery !== filters.query) {
    setSeenQuery(filters.query);
    setDraft(filters.query);
  }
  // Say it instead of typing it: the words land in the box, to fix before pressing Search.
  const dictation = useDictation({ textAtStart: () => draft, onText: setDraft });
  const places = filters.locations ?? sourceSearch?.places ?? [];
  const [where, setWhere] = useState(places.join(", "));
  // Where starts as the profile's places and follows the filter when something else changes it (Clear, Show me anyway).
  useEffect(() => {
    if (filters.locations === undefined && sourceSearch?.places.length) onChange({ locations: sourceSearch.places });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.locations === undefined]);
  const [seen, setSeen] = useState(filters.locations);
  if (seen !== filters.locations) {
    setSeen(filters.locations);
    const now = (filters.locations ?? sourceSearch?.places ?? []).join(", ");
    if (splitPlaces(now).join("|") !== splitPlaces(where).join("|")) setWhere(now);
  }
  const activeCount = (filters.hideInPipeline ? 1 : 0) + (filters.strictProfile ? 1 : 0) + (filters.levels?.length ?? 0) + filters.workModes.length + filters.sourceIds.length + (filters.freshnessDays ? 1 : 0) + (filters.minSalary ? 1 : 0) + (sort !== "best_match" ? 1 : 0);
  const view = viewOf(filters);
  const partTime = findModeOf(filters) === "part_time";
  // Part Time's last few searches, under the box while it has focus; one tap searches again.
  const recentSearches = useJobsStore((s) => s.recentSearches);
  const forgetSearch = useJobsStore((s) => s.forgetSearch);
  const [boxFocused, setBoxFocused] = useState(false);
  const typedNow = draft.trim().toLowerCase();
  const history = recentSearches.filter((t) => t.toLowerCase() !== typedNow && (!typedNow || t.toLowerCase().includes(typedNow)));
  // Applies what's in the box and the Where field to the list.
  const commit = (text = draft) => onChange({ query: text, locations: splitPlaces(where) });
  // Search: Part Time the typed words (or a history item's), Full Time the Career Profile's own search.
  const submit = (text = draft) => {
    if (partTime) commit(text);
    else onChange({ query: "", locations: splitPlaces(where) });
    // Words searched: every source too, not only the jobs already on screen.
    // Full Time has no box: it is always the Career Profile's own search.
    const words = partTime ? text.trim() : "";
    // Part Time: only typed words are searched — nothing typed is asked for, not filled in from the profile.
    if (filters.skipProfile && (!words || !sourceSearch?.describe(words, splitPlaces(where)))) {
      setNeedWords(true);
      return;
    }
    if (words && sourceSearch?.describe(words, splitPlaces(where))) {
      if (partTime) useJobsStore.getState().rememberSearch(words);
      sourceSearch.run(words, splitPlaces(where));
    } else if (!words) sourceSearch?.runPlaces(splitPlaces(where));
  };
  if (shortlist) return <ShortlistFilters text={shortlist.text} onText={shortlist.onText} filters={filters} onChange={onChange} className={className} />;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBoxFocused(false);
          submit();
        }}
      >
        {partTime && (
        <div className="relative order-1 min-w-0 flex-[1_1_16rem]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNeedWords(false);
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
            className={cn("h-11 rounded-full pl-10 sm:h-12", dictation.supported ? "pr-20" : "pr-10")}
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
          {boxFocused && history.length > 0 && (
            // Taps here mustn't take the focus from the box first (that would close the list before the tap lands).
            <ul aria-label="Recent searches" className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[16px] border border-line bg-surface py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
              {history.map((t) => (
                <li key={t} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(t);
                      setBoxFocused(false);
                      (document.activeElement as HTMLElement | null)?.blur();
                      submit(t);
                    }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3.5 text-left text-[14px] text-ink hover:bg-bg-soft"
                  >
                    <History className="size-4 shrink-0 text-ink-4" aria-hidden />
                    <span className="truncate">{t}</span>
                  </button>
                  <button type="button" aria-label={`Remove “${t}” from recent searches`} onClick={() => forgetSearch(t)} className="mr-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-ink">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
        {/* The mode's job types: between the box and the button on a phone; under both on a wider screen. */}
        <JobTypeChips filters={filters} onChange={onChange} className="order-2 basis-full sm:order-3" />
        {partTime || !sourceSearch ? (
          <Button type="submit" icon={<Search className="size-4" aria-hidden />} className="order-3 h-11 shrink-0 rounded-full max-sm:flex-1 sm:order-2 sm:h-12">
            Search
          </Button>
        ) : (
          // One pill, two actions: the search, and "Career Profile" as a link to the profile it searches.
          <div className="wj-gradient-bg order-3 flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium text-white shadow-brand sm:order-2 sm:h-12 sm:flex-none">
            <button type="submit" aria-label="Search based on Career Profile" className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Search className="size-4" aria-hidden /> Search based on
            </button>
            <Link href="/app/career-dna?from=find" className="inline-flex min-h-11 items-center whitespace-nowrap underline decoration-white/70 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Career Profile
            </Link>
          </div>
        )}
      </form>
      {needWords && <p role="alert" className="-mt-1 text-[12px] text-danger-600">Type the work you&apos;re looking for — Part Time searches only your words.</p>}
      {dictation.listening && <p aria-live="polite" className="-mt-1 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : "Listening — say the role and where, e.g. “IAM director roles in Mumbai”."}</p>}
      {dictation.error && <p role="alert" className="-mt-1 text-[12px] text-danger-600">{dictation.error}</p>}
      {/* The views, and Refine beside them (it never leaves the screen). */}
      <div className="flex items-center gap-1.5 max-[380px]:gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto max-[380px]:gap-1 pb-0.5 [scrollbar-width:none]">
          {views &&
            VIEWS.map((v) => (
              <Chip key={v.value} active={view === v.value} onClick={() => onChange(VIEW_PATCH[v.value])} className="h-9 shrink-0 px-3 max-[400px]:px-2.5 max-[380px]:px-2 max-[380px]:text-[12.5px]">
                {v.label}
              </Chip>
            ))}
        </div>
        <Button size="sm" variant={more ? "secondary" : "outline"} className="h-9 shrink-0 rounded-full px-2.5" icon={<SlidersHorizontal className="size-4" aria-hidden />} onClick={() => setMore((m) => !m)} aria-expanded={more} aria-label={`Refine${activeCount ? `, ${activeCount} set` : ""}`} title="Refine">
          {activeCount ? String(activeCount) : null}
        </Button>
        <span className={cn("hidden shrink-0 pl-2 text-[13px] text-ink-3", showCount && "sm:inline")}>{total.toLocaleString("en-IN")} {total === 1 ? "job" : "jobs"}</span>
      </div>
      {more && (
        <div className="grid grid-cols-1 gap-4 rounded-[16px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {/* Back to the list without changing anything typed here. */}
          <button type="button" onClick={() => setMore(false)} className="-mb-1 inline-flex min-h-9 items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink sm:col-span-2 lg:col-span-3">
            <ArrowLeft className="size-4" aria-hidden /> Back to jobs
          </button>
          {refineTop && <div className="border-b border-line pb-3 sm:col-span-2 lg:col-span-3 [&>*:last-child]:mb-0">{refineTop}</div>}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Location
            <Input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
              placeholder="Anywhere — e.g. Mumbai, Remote"
              enterKeyHint="search"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Level
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((l) => (
                <Chip key={l.value} active={!!filters.levels?.includes(l.value)} onClick={() => onChange({ levels: filters.levels?.includes(l.value) ? filters.levels.filter((x) => x !== l.value) : [...(filters.levels ?? []), l.value] })} className="h-9 px-3 text-[12px]">
                  {l.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Work mode
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                <Chip key={m} active={filters.workModes.includes(m)} onClick={() => onChange({ workModes: filters.workModes.includes(m) ? filters.workModes.filter((x) => x !== m) : [...filters.workModes, m] })} className="h-9 px-3 text-[12px]">
                  {WORK_MODE_LABEL[m]}
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
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Minimum salary (₹ lakh)
            <Input type="number" inputMode="numeric" min={0} step={1} value={filters.minSalary ? Math.round(filters.minSalary / 100_000) : ""} onChange={(e) => onChange({ minSalary: e.target.value ? Number(e.target.value) * 100_000 : undefined })} placeholder="e.g. 28" />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Sort
            <Segmented<JobSort> label="Sort" value={sort} onChange={onSort} options={[{ value: "best_match", label: "Best match" }, { value: "date", label: "Newest" }, { value: "salary", label: "Salary" }]} size="sm" />
          </div>
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
          {/* One action for everything above: search every source with these words and places, then show the list. */}
          <div className="sticky bottom-[calc(var(--wj-mobile-nav-h)+0.5rem)] flex flex-wrap items-center gap-2 border-t border-line bg-surface pt-3 sm:col-span-2 md:bottom-2 lg:col-span-3">
            {sourceSearch && (
              <Button
                className="min-w-0 flex-1 sm:flex-none"
                icon={<Search className="size-4" aria-hidden />}
                onClick={() => {
                  commit();
                  // Strictly within the profile: its own search (role and field), in these places.
                  const words = draft.trim();
                  if (words && !filters.strictProfile) sourceSearch.run(words, splitPlaces(where));
                  else sourceSearch.runPlaces(splitPlaces(where));
                  setMore(false);
                }}
              >
                Search
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                commit();
                setMore(false);
              }}
            >
              Show {total.toLocaleString("en-IN")} {total === 1 ? "job" : "jobs"}
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
                  onChange({ workModes: [], levels: [], jobTypes: [], company: "", salaryListed: false, strictProfile: false, hideInPipeline: false, sourceIds: [], freshnessDays: null, minSalary: undefined });
                  onSort("best_match");
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
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <Input
          type="search"
          value={text}
          onChange={(e) => {
            onText(e.target.value);
            if (dictation.listening) dictation.rebase(e.target.value);
          }}
          placeholder="Filter saved jobs"
          aria-label="Filter saved jobs"
          enterKeyHint="done"
          className={cn("h-11 rounded-full pl-10 sm:h-12", dictation.supported ? "pr-20" : "pr-10")}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {text && (
            <button type="button" aria-label="Clear filter" onClick={() => onText("")} className="rounded-full p-2 text-ink-4 hover:bg-bg-soft hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          )}
          {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label="what to look for in your saved jobs" />}
        </div>
      </div>
      <JobTypeChips filters={filters} onChange={onChange} />
      <label className={cn("inline-flex h-9 cursor-pointer select-none items-center gap-1.5 self-start rounded-full border px-3 text-[13px] font-medium transition-colors", filters.hideInPipeline ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink")}>
        <input type="checkbox" className="size-3.5 shrink-0 accent-[var(--color-brand-600)]" checked={!!filters.hideInPipeline} onChange={(e) => onChange({ hideInPipeline: e.target.checked })} />
        Hide Pipeline
      </label>
    </div>
  );
}
