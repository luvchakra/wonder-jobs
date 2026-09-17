"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark } from "lucide-react";
import type { FitLabel } from "@/domain/jobs/types";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useDebounced } from "@/lib/useDebounce";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFiltersBar } from "@/components/jobs/JobFilters";
import { toast } from "@/components/feedback/Toast";

const FIT_RANK: Record<FitLabel, number> = { strong: 3, worth_considering: 2, stretch: 1, low_fit: 0 };
const PAGE = 24;

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
  const filters = useJobsStore((s) => s.filters);
  const setFilters = useJobsStore((s) => s.setFilters);
  const sort = useJobsStore((s) => s.sort);
  const setSort = useJobsStore((s) => s.setSort);
  const sources = useJobsStore((s) => s.sources);
  const applications = useApplicationsStore((s) => s.applications);
  const now = useNow();
  const [limit, setLimit] = useState(PAGE);
  const query = useDebounced(filters.query, 250);

  // Deep links: /app/jobs?fit=strong, ?saved=1
  useEffect(() => {
    const fit = params.get("fit") as FitLabel | null;
    const onlySaved = params.get("saved") === "1";
    const q = params.get("q");
    if (fit || onlySaved || q) setFilters({ ...(fit || onlySaved ? { minFit: fit ?? null, onlySaved } : {}), ...(q != null ? { query: q } : {}) });
  }, [params, setFilters]);

  const appByJob = useMemo(() => new Map(Object.values(applications).map((a) => [a.jobId, a])), [applications]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const list = order.filter((id) => {
      const j = jobs[id];
      const m = matches[id];
      if (!j || rejected[id]) return false;
      if (filters.onlySaved && !saved[id]) return false;
      if (filters.workModes.length && !filters.workModes.includes(j.workMode)) return false;
      if (filters.sourceIds.length && !j.sourceIds.some((s) => filters.sourceIds.includes(s))) return false;
      if (filters.minFit && (!m || FIT_RANK[m.fit] < FIT_RANK[filters.minFit])) return false;
      if (filters.freshnessDays && now - new Date(j.postedAt).getTime() > filters.freshnessDays * 86_400_000) return false;
      if (filters.minSalary && (j.salaryMax == null || (j.currency === "INR" ? j.salaryMax : j.salaryMax * 30) < filters.minSalary)) return false;
      if (terms.length) {
        const hay = `${j.title} ${j.company} ${j.location} ${j.skills.join(" ")} ${j.tags.join(" ")}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "date") return jobs[b].postedAt.localeCompare(jobs[a].postedAt);
      if (sort === "salary") return (jobs[b].salaryMax ?? 0) - (jobs[a].salaryMax ?? 0);
      return (matches[b]?.score ?? 0) - (matches[a]?.score ?? 0) || jobs[b].postedAt.localeCompare(jobs[a].postedAt);
    });
    return list;
  }, [order, jobs, matches, rejected, saved, filters, query, sort, now]);

  const visible = results.slice(0, limit);

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Every opportunity Wonder has found, ranked by how well it fits your Career DNA."
        actions={
          <Button variant="outline" icon={<Bookmark className="size-4" aria-hidden />} onClick={() => toast.success("Search saved", "Wonder will use these filters in your next scheduled run.")}>
            Save search
          </Button>
        }
      />
      <JobFiltersBar filters={filters} onChange={(p) => { setFilters(p); setLimit(PAGE); }} sort={sort} onSort={setSort} sources={sources} total={results.length} className="mb-5" />
      {results.length === 0 ? (
        <EmptyState title="No jobs match these filters" body="Try a broader search, or run Wonder to search all sources again." action={{ label: "Run Wonder", href: "/app/runs/new" }} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Job results">
            {visible.map((id) => (
              <li key={id}>
                <JobCard job={jobs[id]} match={matches[id]} quality={quality[id]} saved={!!saved[id]} onToggleSave={() => (saved[id] ? unsave(id) : save(id))} status={appByJob.get(id) ? appByJob.get(id)!.status.replace(/_/g, " ") : undefined} />
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
