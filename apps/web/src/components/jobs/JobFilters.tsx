"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Search, SlidersHorizontal, X } from "lucide-react";
import type { JobFilters as Filters, JobSort, JobSource, WorkMode } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { Chip, Input, Select, Segmented } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/dictation";
import { DictateButton } from "@/components/common/DictateButton";

export type JobsView = "for_you" | "strong" | "all" | "saved";
// Saved is its own tab, not a view here.
const VIEWS: { value: JobsView; label: string }[] = [
  { value: "for_you", label: "For you" },
  { value: "strong", label: "Strong" },
  { value: "all", label: "All" },
];

/** Which view a set of filters is — views are presets over the same filters, so they can't disagree with Refine or "Why was this filtered". */
export const viewOf = (f: Filters): JobsView => (f.onlySaved ? "saved" : f.minFit === "strong" ? "strong" : f.minFit === "worth_considering" ? "for_you" : "all");
export const VIEW_PATCH: Record<JobsView, Partial<Filters>> = {
  for_you: { onlySaved: false, minFit: "worth_considering" },
  strong: { onlySaved: false, minFit: "strong" },
  all: { onlySaved: false, minFit: null },
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

const splitPlaces = (text: string) => text.split(",").map((p) => p.trim()).filter(Boolean);

/**
 * What and where (typing narrows the jobs already found; Enter searches every source for it, in those
 * places — before a search or while one runs), one row of views, and everything else — sort, work mode,
 * freshness, salary, sources, compare — in Refine.
 */
export function JobFiltersBar({ filters, onChange, sort, onSort, total, views = true, compare, onCompare, sourceSearch, showCount = true, refineTop, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sort: JobSort; onSort: (s: JobSort) => void; sources?: JobSource[]; total: number; views?: boolean; compare: boolean; onCompare: (on: boolean) => void; sourceSearch?: SourceSearch; /** The job count beside Refine (off when the list says it in its own line). */ showCount?: boolean; /** What was searched and "Search as" — first thing in Refine. */ refineTop?: React.ReactNode; className?: string }) {
  const [more, setMore] = useState(false);
  // Typing only changes the box; Search (or Enter) applies the words. Kept in step when something else
  // changes them (a link with ?q=, "clear" in the list).
  const [draft, setDraft] = useState(filters.query);
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
  const activeCount = (filters.strictProfile ? 1 : 0) + (filters.levels?.length ?? 0) + filters.workModes.length + filters.sourceIds.length + (filters.freshnessDays ? 1 : 0) + (filters.minSalary ? 1 : 0) + (sort !== "best_match" ? 1 : 0);
  const view = viewOf(filters);
  // Applies what's in the box and the Where field to the list.
  const commit = () => onChange({ query: draft, locations: splitPlaces(where) });
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        className="flex"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
          // Words searched: every source too, not only the jobs already on screen.
          const words = draft.trim();
          if (words && sourceSearch?.describe(words, splitPlaces(where))) sourceSearch.run(words, splitPlaces(where));
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (dictation.listening) dictation.rebase(e.target.value);
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
        </div>
        <Button type="submit" className="ml-2 h-11 shrink-0 rounded-full sm:h-12">
          Search
        </Button>
      </form>
      {dictation.listening && <p aria-live="polite" className="-mt-1 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : "Listening — say the role and where, e.g. “IAM director roles in Mumbai”."}</p>}
      {dictation.error && <p role="alert" className="-mt-1 text-[12px] text-danger-600">{dictation.error}</p>}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {views &&
          VIEWS.map((v) => (
            <Chip key={v.value} active={view === v.value} onClick={() => onChange(VIEW_PATCH[v.value])} className="shrink-0">
              {v.label}
            </Chip>
          ))}
        <Button size="sm" variant={more ? "secondary" : "outline"} className="shrink-0" icon={<SlidersHorizontal className="size-3.5" aria-hidden />} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          Refine{activeCount ? ` · ${activeCount}` : ""}
        </Button>
        <span className={cn("ml-auto hidden shrink-0 pl-2 text-[13px] text-ink-3", showCount && "sm:inline")}>{total.toLocaleString("en-IN")} {total === 1 ? "job" : "jobs"}</span>
      </div>
      {more && (
        <div className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-ink sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-brand-600)]" checked={!!filters.strictProfile} onChange={(e) => onChange({ strictProfile: e.target.checked })} />
            <span>
              Search strictly within your{" "}
              <Link href="/app/career-dna" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                Career Profile
              </Link>
            </span>
          </label>
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
                  onChange({ workModes: [], levels: [], company: "", salaryListed: false, strictProfile: false, sourceIds: [], freshnessDays: null, minSalary: undefined });
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
