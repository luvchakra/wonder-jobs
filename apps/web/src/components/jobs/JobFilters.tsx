"use client";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { JobFilters as Filters, JobSort, JobSource, WorkMode } from "@/domain/jobs/types";
import { FIT_META, WORK_MODE_LABEL } from "@/domain/jobs/types";
import { Chip, Input, Select, Segmented } from "@/components/common/Input";
import { cn } from "@/lib/cn";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { CLEAR_FILTERS_PATCH } from "./FilteredBreakdown";

const FIT_ORDER = ["strong", "worth_considering", "stretch"] as const;

export function JobFiltersBar({ filters, onChange, sort, onSort, sources, total, className }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; sort: JobSort; onSort: (s: JobSort) => void; sources: JobSource[]; total: number; className?: string }) {
  const [more, setMore] = useState(false);
  // Fit is now primarily set by the For You/All Jobs/Saved tabs above, and onlySaved by the Saved tab —
  // neither is counted here, so this badge only reflects what a candidate actually changed inside Refine.
  const activeCount = filters.workModes.length + filters.sourceIds.length + (filters.freshnessDays ? 1 : 0) + (filters.minSalary ? 1 : 0);
  const clear = () => onChange(CLEAR_FILTERS_PATCH);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <Input value={filters.query} onChange={(e) => onChange({ query: e.target.value })} placeholder="Search jobs, skills, or companies" aria-label="Search jobs" className="h-12 rounded-full pl-10 pr-10" />
        {filters.query && (
          <button type="button" aria-label="Clear search" onClick={() => onChange({ query: "" })} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-4 hover:bg-bg-soft hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<JobSort> label="Sort" value={sort} onChange={onSort} options={[{ value: "best_match", label: "Best match" }, { value: "date", label: "Date" }, { value: "salary", label: "Salary" }]} size="sm" />
        {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
          <Chip key={m} active={filters.workModes.includes(m)} onClick={() => onChange({ workModes: filters.workModes.includes(m) ? filters.workModes.filter((x) => x !== m) : [...filters.workModes, m] })}>
            {WORK_MODE_LABEL[m]}
          </Chip>
        ))}
        <Button size="sm" variant={more ? "secondary" : "outline"} icon={<SlidersHorizontal className="size-3.5" aria-hidden />} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          Refine{activeCount ? ` · ${activeCount}` : ""}
        </Button>
        <span className="ml-auto text-[13px] text-ink-3">
          {total.toLocaleString("en-IN")} opportunit{total === 1 ? "y" : "ies"}
        </span>
      </div>
      {more && (
        <div className="grid gap-3 rounded-[16px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Fit
            <Select value={filters.minFit ?? ""} onChange={(e) => onChange({ minFit: (e.target.value || null) as Filters["minFit"] })}>
              <option value="">Any fit</option>
              {FIT_ORDER.map((f) => (
                <option key={f} value={f}>
                  {FIT_META[f].label} and better
                </option>
              ))}
            </Select>
            <span className="text-[11px] font-normal text-ink-4">Based on your Career Profile match score.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Freshness
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
          {activeCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
