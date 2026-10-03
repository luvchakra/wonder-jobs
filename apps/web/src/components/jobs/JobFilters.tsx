"use client";
import { useState } from "react";
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
  /** Search every source for what was typed. */
  run: (text: string) => void;
  /** What that search would look for, in plain words ("“data analyst” in Pune"); null when no role can be read. */
  describe: (text: string) => string | null;
}

/**
 * One search box (typing narrows the jobs already found; one tap searches every source for it), one row
 * of views, and everything else — sort, work mode, freshness, salary, sources, compare — in Refine.
 */
export function JobFiltersBar({ filters, onChange, sort, onSort, sources, total, views = true, compare, onCompare, sourceSearch, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sort: JobSort; onSort: (s: JobSort) => void; sources: JobSource[]; total: number; views?: boolean; compare: boolean; onCompare: (on: boolean) => void; sourceSearch?: SourceSearch; className?: string }) {
  const [more, setMore] = useState(false);
  // Say it instead of typing it: the words land in the box, to fix before searching every source.
  const dictation = useDictation({ textAtStart: () => filters.query, onText: (text) => onChange({ query: text }) });
  const activeCount = filters.workModes.length + filters.sourceIds.length + (filters.freshnessDays ? 1 : 0) + (filters.minSalary ? 1 : 0) + (sort !== "best_match" ? 1 : 0);
  const view = viewOf(filters);
  const typed = filters.query.trim();
  const wider = typed && sourceSearch ? sourceSearch.describe(typed) : null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (wider) sourceSearch!.run(typed);
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <Input
          value={filters.query}
          onChange={(e) => {
            onChange({ query: e.target.value });
            if (dictation.listening) dictation.rebase(e.target.value);
          }}
          placeholder="Search jobs, skills or companies"
          aria-label="Search jobs"
          className={cn("h-12 rounded-full pl-10", dictation.supported ? "pr-20" : "pr-10")}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {filters.query && (
            <button type="button" aria-label="Clear search" onClick={() => onChange({ query: "" })} className="rounded-full p-1 text-ink-4 hover:bg-bg-soft hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          )}
          {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label="what you're looking for" />}
        </div>
      </form>
      {dictation.listening && <p aria-live="polite" className="-mt-1 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : "Listening — say the role and where, e.g. “IAM director roles in Mumbai”."}</p>}
      {dictation.error && <p role="alert" className="-mt-1 text-[12px] text-danger-600">{dictation.error}</p>}
      {wider && (
        <button type="button" onClick={() => sourceSearch!.run(typed)} className="-mt-1 self-start rounded-full px-1 text-left text-[13px] font-medium text-brand-600 hover:underline">
          Search every source for {wider} ›
        </button>
      )}
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
        <span className="ml-auto shrink-0 pl-2 text-[13px] text-ink-3">{total.toLocaleString("en-IN")}</span>
      </div>
      {more && (
        <div className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Sort
            <Segmented<JobSort> label="Sort" value={sort} onChange={onSort} options={[{ value: "best_match", label: "Best match" }, { value: "date", label: "Newest" }, { value: "salary", label: "Salary" }]} size="sm" />
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Work mode
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                <Chip key={m} active={filters.workModes.includes(m)} onClick={() => onChange({ workModes: filters.workModes.includes(m) ? filters.workModes.filter((x) => x !== m) : [...filters.workModes, m] })} className="h-8 px-3 text-[12px]">
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
              <option value="3">Last 3 days</option>
              <option value="7">Last week</option>
              <option value="14">Last 2 weeks</option>
              <option value="30">Last month</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Minimum salary (₹ lakh)
            <Input type="number" inputMode="numeric" min={0} step={1} value={filters.minSalary ? Math.round(filters.minSalary / 100_000) : ""} onChange={(e) => onChange({ minSalary: e.target.value ? Number(e.target.value) * 100_000 : undefined })} placeholder="e.g. 28" />
            <span className="text-[11px] font-normal text-ink-4">Roles listed in other currencies are roughly converted (1 USD ≈ ₹30) to compare.</span>
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Sources
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <Chip key={s.id} active={filters.sourceIds.includes(s.id)} onClick={() => onChange({ sourceIds: filters.sourceIds.includes(s.id) ? filters.sourceIds.filter((x) => x !== s.id) : [...filters.sourceIds, s.id] })} className="h-8 px-3 text-[12px]">
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Compare
            <Chip active={compare} onClick={() => onCompare(!compare)} className="h-8 self-start px-3 text-[12px]">
              <GitCompareArrows className="size-3.5" aria-hidden /> Compare jobs
            </Chip>
            <span className="text-[11px] font-normal text-ink-4">Pick two to four jobs on the list to see their differences side by side.</span>
          </div>
          {activeCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange({ workModes: [], sourceIds: [], freshnessDays: null, minSalary: undefined });
                  onSort("best_match");
                }}
              >
                Clear refinements
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
