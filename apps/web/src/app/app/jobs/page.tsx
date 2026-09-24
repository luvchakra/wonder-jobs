"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FitLabel } from "@/domain/jobs/types";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useDebounced } from "@/lib/useDebounce";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Segmented } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFiltersBar } from "@/components/jobs/JobFilters";
import { FilteredBreakdown, CLEAR_FILTERS_PATCH } from "@/components/jobs/FilteredBreakdown";
import { applyJobFilters } from "@/domain/jobs/filterExplain";
import { toast } from "@/components/feedback/Toast";

const PAGE = 24;

type ViewTab = "for_you" | "all" | "saved";
const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "for_you", label: "For You" },
  { value: "all", label: "All Jobs" },
  { value: "saved", label: "Saved" },
];

function JobsInner() {
  const params = useSearchParams();
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const rejected = useJobsStore((s) => s.rejected);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const reject = useJobsStore((s) => s.reject);
  const unreject = useJobsStore((s) => s.unreject);
  const filters = useJobsStore((s) => s.filters);
  const setFilters = useJobsStore((s) => s.setFilters);
  const sort = useJobsStore((s) => s.sort);
  const setSort = useJobsStore((s) => s.setSort);
  const sources = useJobsStore((s) => s.sources);
  const applications = useApplicationsStore((s) => s.applications);
  const now = useNow();
  const [limit, setLimit] = useState(PAGE);
  const query = useDebounced(filters.query, 250);

  // Deep links: /app/jobs?fit=strong, ?saved=1 — same as before. With neither given, land on the
  // "For You" view (Wonder's own picks) rather than an unfiltered catalog dump.
  useEffect(() => {
    const fit = params.get("fit") as FitLabel | null;
    const onlySaved = params.get("saved") === "1";
    const q = params.get("q");
    if (fit || onlySaved || q) setFilters({ ...(fit || onlySaved ? { minFit: fit ?? null, onlySaved } : {}), ...(q != null ? { query: q } : {}) });
    else setFilters({ minFit: "worth_considering" });
    // Only ever apply this once, from the URL the page was opened with — not on every filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primary views (spec: "keep advanced filters behind Refine") — presets over the same filters
  // Refine and the deep links above already use, so results and "Why Was This Filtered" can never
  // disagree about what a tab means.
  const activeTab: ViewTab = filters.onlySaved ? "saved" : filters.minFit === "worth_considering" ? "for_you" : "all";
  const selectTab = (tab: ViewTab) => {
    setLimit(PAGE);
    if (tab === "saved") setFilters({ onlySaved: true });
    else if (tab === "for_you") setFilters({ onlySaved: false, minFit: "worth_considering" });
    else setFilters({ onlySaved: false, minFit: null });
  };

  const appByJob = useMemo(() => new Map(Object.values(applications).map((a) => [a.jobId, a])), [applications]);

  // Single source of truth for what's visible and why the rest is hidden — the results list and the
  // "Why Was This Filtered" breakdown below can never disagree, because they read the same computation.
  const filterResult = useMemo(() => applyJobFilters(order, jobs, matches, rejected, saved, { ...filters, query }, now), [order, jobs, matches, rejected, saved, filters, query, now]);
  const results = useMemo(() => {
    const list = [...filterResult.visibleIds];
    list.sort((a, b) => {
      if (sort === "date") return jobs[b].postedAt.localeCompare(jobs[a].postedAt);
      if (sort === "salary") return (jobs[b].salaryMax ?? 0) - (jobs[a].salaryMax ?? 0);
      return (matches[b]?.score ?? 0) - (matches[a]?.score ?? 0) || jobs[b].postedAt.localeCompare(jobs[a].postedAt);
    });
    return list;
  }, [filterResult, jobs, matches, sort]);

  const visible = results.slice(0, limit);
  const showAnyway = () => setFilters(CLEAR_FILTERS_PATCH);

  return (
    <div>
      <PageHeader title="Jobs" description="Every opportunity Wonder has found, ranked by how well it fits your Career DNA." />
      <Segmented<ViewTab> label="View" value={activeTab} onChange={selectTab} options={VIEW_TABS} className="mb-4" />
      <JobFiltersBar filters={filters} onChange={(p) => { setFilters(p); setLimit(PAGE); }} sort={sort} onSort={setSort} sources={sources} total={results.length} className="mb-5" />
      {results.length === 0 ? (
        filterResult.hiddenTotal > 0 ? (
          <FilteredBreakdown result={filterResult} onShowAnyway={() => { showAnyway(); setLimit(PAGE); }} variant="empty" />
        ) : (
          <EmptyState title="No jobs discovered yet" body="Tell Wonder what you're looking for and it will search your sources." action={{ label: "Find opportunities", href: "/app/runs/new" }} />
        )
      ) : (
        <>
          <FilteredBreakdown result={filterResult} onShowAnyway={() => { showAnyway(); setLimit(PAGE); }} />
          <h2 className="wj-sr-only">Job results</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Job results">
            {visible.map((id) => (
              <li key={id}>
                <JobCard
                  job={jobs[id]}
                  match={matches[id]}
                  quality={quality[id]}
                  saved={!!saved[id]}
                  onToggleSave={() => (saved[id] ? unsave(id) : save(id))}
                  onReject={() => {
                    reject(id);
                    toast.info("Marked not for me", "Wonder won't show this job again. Once you mark a few similar roles, it starts ranking that pattern lower too.", { label: "Undo", onClick: () => unreject(id) });
                  }}
                  status={appByJob.get(id) ? appByJob.get(id)!.status.replace(/_/g, " ") : undefined}
                />
              </li>
            ))}
          </ul>
          {visible.length < results.length && (
            <div className="mt-5 flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({results.length - visible.length} left)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <JobsInner />
    </Suspense>
  );
}
