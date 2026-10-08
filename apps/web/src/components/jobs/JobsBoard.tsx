"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";
import type { FitLabel } from "@/domain/jobs/types";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useDebounced } from "@/lib/useDebounce";
import { useNow } from "@/lib/motion";
import { Button } from "@/components/common/Button";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFiltersBar, type SourceSearch } from "@/components/jobs/JobFilters";
import { FilteredBreakdown, CLEAR_FILTERS_PATCH } from "@/components/jobs/FilteredBreakdown";
import { applyJobFilters } from "@/domain/jobs/filterExplain";
import { fieldTerms } from "@/services/jobs/matching";
import { deriveSearchIntent } from "@/services/jobs/searchIntent";
import { useCareerStore } from "@/store/career";
import { useLinkCheck } from "@/lib/useLinkCheck";
import { track } from "@/lib/analytics";
import { toast } from "@/components/feedback/Toast";

const PAGE = 24;

/**
 * The job list: search box, cards, compare, "Why was this filtered". The jobs come first on the page;
 * `header` is only for a line that must be seen before them (a search in progress), `footer` for
 * everything else (what was searched, roles, notes). `savedOnly` makes it the Saved shortlist. `searched`
 * (the search behind the jobs on screen) gives the one line above them: how many, for what, where, from how many sources.
 */
export function JobsBoard({ header, footer, refineTop, empty, sourceSearch, searched, savedOnly = false }: { header?: React.ReactNode; footer?: React.ReactNode; refineTop?: React.ReactNode; empty: React.ReactNode; sourceSearch?: SourceSearch; searched?: { query: string; locations: string[] } | null; savedOnly?: boolean }) {
  const params = useSearchParams();
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const matches = useJobsStore((s) => s.matches);
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
  const [compare, setCompare] = useState<string[]>([]);
  const router = useRouter();
  const toggleCompare = (id: string) =>
    setCompare((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 4) {
        toast.info("Compare up to 4 at a time", "Remove one to add another.");
        return ids;
      }
      return [...ids, id];
    });
  const query = useDebounced(filters.query, 250);

  // Deep links: /app/jobs?fit=strong, ?q=… — same as before; ?saved=1 is the Saved tab now. With
  // nothing given, land on the "For You" view (Wonder's own picks) rather than an unfiltered dump.
  useEffect(() => {
    if (savedOnly) return;
    if (params.get("saved") === "1") {
      router.replace("/app/saved");
      return;
    }
    const fit = params.get("fit") as FitLabel | null;
    const q = params.get("q");
    if (fit || q) setFilters({ onlySaved: false, ...(fit ? { minFit: fit } : {}), ...(q != null ? { query: q } : {}) });
    else setFilters({ onlySaved: false, minFit: "worth_considering" });
    // Only ever apply this once, from the URL the page was opened with — not on every filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [compareMode, setCompareMode] = useState(false);

  const appByJob = useMemo(() => new Map(Object.values(applications).map((a) => [a.jobId, a])), [applications]);

  // Single source of truth for what's visible and why the rest is hidden — the results list and the
  // "Why Was This Filtered" breakdown below can never disagree, because they read the same computation.
  // Saved shows every bookmarked job whatever its fit; Find never shows only saved ones (that's the Saved tab).
  const effective = useMemo(() => ({ ...filters, query, onlySaved: savedOnly, minFit: savedOnly ? null : filters.minFit }), [filters, query, savedOnly]);
  const headline = useCareerStore((s) => s.dna.headline);
  const goal = useCareerStore((s) => s.dna.careerGoal);
  const field = useMemo(() => fieldTerms(headline, goal), [headline, goal]);
  const filterResult = useMemo(() => applyJobFilters(order, jobs, matches, rejected, saved, effective, now, field), [order, jobs, matches, rejected, saved, effective, now, field]);
  const results = useMemo(() => {
    const list = [...filterResult.visibleIds];
    list.sort((a, b) => {
      if (sort === "date") return jobs[b].postedAt.localeCompare(jobs[a].postedAt);
      if (sort === "salary") return (jobs[b].salaryMax ?? 0) - (jobs[a].salaryMax ?? 0);
      // With words in the box, best match is how well a job answers them first, then how well it fits the profile.
      const rel = filterResult.relevance;
      const score = (id: string) => (rel ? 0.55 * (rel[id] ?? 0) * 100 + 0.45 * (matches[id]?.score ?? 0) : (matches[id]?.score ?? 0));
      return score(b) - score(a) || jobs[b].postedAt.localeCompare(jobs[a].postedAt);
    });
    return list;
  }, [filterResult, jobs, matches, sort]);

  const visible = results.slice(0, limit);
  // "Showing 14 jobs for “iam director” in Mumbai from 2 sources" — every number from what's on screen.
  const summary = useMemo(() => {
    if (savedOnly || header || !searched || !results.length) return null;
    const what = effective.query.trim() || searched.query;
    const where = effective.locations?.length ? effective.locations : searched.locations;
    const sourceCount = new Set(results.flatMap((id) => (jobs[id]?.lake?.sightings.length ? jobs[id].lake!.sightings.map((x) => x.sourceId) : (jobs[id]?.sourceIds ?? [])))).size;
    const n = results.length.toLocaleString("en-IN");
    return `Showing ${n} ${results.length === 1 ? "job" : "jobs"}${what ? ` for “${what}”` : ""} ${where.length ? `in ${where.join(", ")}` : "anywhere"} from ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`;
  }, [savedOnly, header, searched, results, effective.query, effective.locations, jobs]);
  // Nothing on screen answers the words typed: the empty list offers to search every source (once — not again under the box).
  const typed = effective.query.trim();
  const searchInEmpty = !!sourceSearch && !!typed && results.length === 0 && !savedOnly && !!filterResult.hiddenByReason.search_text;
  const typedPlaces = useMemo(() => {
    const i = deriveSearchIntent(typed);
    return !i.query && i.locations.length ? i.locations : undefined;
  }, [typed]);
  // The jobs on screen are checked against their own sites; closed ones leave the list.
  useLinkCheck(visible);
  const closed = useJobsStore((s) => s.closed);
  // "Wonder found N opportunities" — the real catalog Wonder has, minus what the candidate set aside.
  const showAnyway = () => setFilters(CLEAR_FILTERS_PATCH);

  return (
    <div>
      {header}
      <JobFiltersBar
        showCount={!summary}
        filters={effective}
        views={!savedOnly}
        onChange={(p) => {
          setFilters(p);
          setLimit(PAGE);
        }}
        sort={sort}
        onSort={setSort}
        sources={sources}
        total={results.length}
        compare={compareMode}
        onCompare={(on) => {
          setCompareMode(on);
          if (!on) setCompare([]);
        }}
        sourceSearch={sourceSearch}
        refineTop={refineTop}
        className="mb-4"
      />
      {results.length === 0 ? (
        filterResult.hiddenTotal > 0 && !savedOnly ? (
          <FilteredBreakdown
            result={filterResult}
            onShowAnyway={() => {
              showAnyway();
              setLimit(PAGE);
            }}
            variant="empty"
            // The words typed hide what Wonder has: the answer is to search every source for them, not to drop them.
            search={searchInEmpty ? { label: sourceSearch!.describe(effective.query.trim(), effective.locations ?? []), run: () => sourceSearch!.run(effective.query.trim(), effective.locations ?? []), places: typedPlaces } : undefined}
          />
        ) : (
          empty
        )
      ) : (
        <>
          <h2 className="wj-sr-only">Job results</h2>
          {summary && <p className="mb-3 text-[13px] text-ink-3">{summary}</p>}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Job results">
            {visible.map((id) => (
              <li key={id}>
                <JobCard
                  job={jobs[id]}
                  match={matches[id]}
                  saved={!!saved[id]}
                  onToggleSave={() => (saved[id] ? unsave(id) : save(id))}
                  status={closed[id] ? "posting closed" : appByJob.get(id) ? appByJob.get(id)!.status.replace(/_/g, " ") : undefined}
                  compareSelected={compare.includes(id)}
                  onToggleCompare={compareMode ? () => toggleCompare(id) : undefined}
                />
              </li>
            ))}
          </ul>
          {compare.length > 0 && (
            <div className="fixed inset-x-4 bottom-[calc(var(--wj-mobile-nav-h)+1rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-[16px] border border-line bg-surface p-3 shadow-lg md:bottom-6" role="region" aria-label="Compare opportunities">
              <GitCompareArrows className="size-5 shrink-0 text-brand-600" aria-hidden />
              <p className="min-w-0 flex-1 text-[13px] text-ink-2">{compare.length === 1 ? "Pick one more to compare" : `${compare.length} selected to compare`}</p>
              <Button size="sm" variant="ghost" onClick={() => setCompare([])} aria-label="Clear comparison" icon={<X className="size-4" aria-hidden />} />
              <Button
                size="sm"
                disabled={compare.length < 2}
                onClick={() => {
                  track("comparison_started", { count: compare.length });
                  router.push(`/app/jobs/compare?ids=${compare.join(",")}`);
                }}
              >
                Compare
              </Button>
            </div>
          )}
          {visible.length < results.length && (
            <div className="mt-5 flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({results.length - visible.length} left)
              </Button>
            </div>
          )}
        </>
      )}
      {footer}
      {/* What's hidden and why — below the jobs, so nothing stands between the candidate and the first one. */}
      {results.length > 0 && !savedOnly && (
        <FilteredBreakdown
          result={filterResult}
          onShowAnyway={() => {
            showAnyway();
            setLimit(PAGE);
          }}
        />
      )}
    </div>
  );
}
