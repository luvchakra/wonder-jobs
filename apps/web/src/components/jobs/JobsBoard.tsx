"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitCompareArrows, Search, X } from "lucide-react";
import { EmptyState } from "@/components/common/States";
import type { CanonicalJob, FitLabel, JobMatch } from "@/domain/jobs/types";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useDebounced } from "@/lib/useDebounce";
import { useNow } from "@/lib/motion";
import { Button } from "@/components/common/Button";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFiltersBar, SortMenu, type SourceSearch } from "@/components/jobs/JobFilters";
import { savedTextMatches } from "@/domain/jobs/savedText";
import { FilteredBreakdown, CLEAR_FILTERS_PATCH } from "@/components/jobs/FilteredBreakdown";
import { applyJobFilters } from "@/domain/jobs/filterExplain";
import { placesOnly } from "@/domain/jobs/searchScope";
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
export function JobsBoard({ header, footer, refineTop, empty, sourceSearch, searched, searching, partTimeMiss, savedOnly = false }: { header?: React.ReactNode; footer?: React.ReactNode; refineTop?: React.ReactNode; empty: React.ReactNode; sourceSearch?: SourceSearch; searched?: { query: string; locations: string[] } | null; /** Shown in place of an empty list while a search runs. */ searching?: React.ReactNode; /** Part Time's last search found nothing: what it was for. */ partTimeMiss?: string | null; savedOnly?: boolean }) {
  const params = useSearchParams();
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const matches = useJobsStore((s) => s.matches);
  const saved = useJobsStore((s) => s.saved);
  const removedFromPipeline = useJobsStore((s) => s.removedFromPipeline);
  const rejected = useJobsStore((s) => s.rejected);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const filters = useJobsStore((s) => s.filters);
  const setFilters = useJobsStore((s) => s.setFilters);
  const sort = useJobsStore((s) => s.sort);
  const sources = useJobsStore((s) => s.sources);
  const applications = useApplicationsStore((s) => s.applications);
  const now = useNow();
  const [limit, setLimit] = useState(PAGE);
  const [compare, setCompare] = useState<string[]>([]);
  const router = useRouter();
  // Stable across renders, so a card re-renders only when its own job, score or state changes — not on
  // every progress event of a running search.
  const toggleSave = useCallback((id: string) => (useJobsStore.getState().saved[id] ? unsave(id) : save(id)), [save, unsave]);
  const toggleCompare = useCallback((id: string) =>
    setCompare((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 4) {
        toast.info("Compare up to 4 at a time", "Remove one to add another.");
        return ids;
      }
      return [...ids, id];
    }), []);
  // Saved filters its own jobs with its own words, kept here: Find's search words stay Find's.
  const [savedText, setSavedText] = useState("");
  const query = useDebounced(savedOnly ? savedText : filters.query, 250);

  // Deep links: /app/jobs?fit=strong, ?q=… — same as before; ?saved=1 is the Saved tab now. With
  // nothing given, the view kept for the mode stays (All until another is picked).
  useEffect(() => {
    if (savedOnly) return;
    if (params.get("saved") === "1") {
      router.replace("/app/saved");
      return;
    }
    const fit = params.get("fit") as FitLabel | null;
    const q = params.get("q");
    const exactFit = !!fit && params.get("exact") === "1";
    // A link's own view or words; otherwise the view the candidate left in Refine (kept per mode, owner 2026-10-23).
    if (fit || q) setFilters({ onlySaved: false, exactFit, ...(fit ? { minFit: fit } : {}), ...(q != null ? { query: q } : {}) });
    else setFilters({ onlySaved: false });
    // Only ever apply this once, from the URL the page was opened with — not on every filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [compareMode, setCompareMode] = useState(false);

  const appByJob = useMemo(() => new Map(Object.values(applications).map((a) => [a.jobId, a])), [applications]);

  // Single source of truth for what's visible and why the rest is hidden — the results list and the
  // "Why Was This Filtered" breakdown below can never disagree, because they read the same computation.
  // Saved shows every bookmarked job whatever its fit; Find never shows only saved ones (that's the Saved tab).
  // Keyed on the filters other than the words (a new object on every keystroke) and the words after their
  // debounce — so typing doesn't re-filter and re-sort every job on each key, only once the words settle.
  const filtersKey = JSON.stringify({ ...filters, query: "" });
  const effective = useMemo(() => {
    const f = JSON.parse(filtersKey) as typeof filters;
    // Saved's words are its own plain look-up (savedTextMatches below), not Find's search. Saved keeps only
    // its own controls (job types, Hide Pipeline): Find's Refine — work mode, salary, level, places… — never
    // hides a job the candidate saved.
    if (savedOnly) return { ...f, query: "", onlySaved: true, minFit: null, exactFit: false, workModes: [], sourceIds: [], freshnessDays: null, minSalary: undefined, salaryListed: false, levels: [], company: "", locations: undefined, strictProfile: false };
    // Full Time with no places picked: the Career Profile's places.
    // Remote is a work mode (Work mode filters it), never a place: "Remote" alone would hide every other job.
    const places = placesOnly(f.locations ?? (f.skipProfile ? undefined : sourceSearch?.places));
    return { ...f, query, onlySaved: false, locations: places?.length ? places : undefined };
  }, [filtersKey, query, savedOnly, sourceSearch?.places]);
  // "Posted more than two weeks ago" and the freshness window don't need a minute's precision: re-check hourly.
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const headline = useCareerStore((s) => s.dna.headline);
  const goal = useCareerStore((s) => s.dna.careerGoal);
  const field = useMemo(() => fieldTerms(headline, goal), [headline, goal]);
  const inPipeline = useMemo(() => new Set([...appByJob.values()].filter((a) => a.status !== "saved").map((a) => a.jobId)), [appByJob]);
  // Saved lists every saved job still known, newest saved first — not only those in Find's latest results.
  const listed = useMemo(() => (savedOnly ? Object.keys(saved).filter((id) => jobs[id]).sort((a, b) => saved[b].localeCompare(saved[a])) : order), [savedOnly, saved, jobs, order]);
  // A job taken out of the Pipeline is back in Find like a saved one: an old posting isn't hidden as too old.
  const kept = useMemo(() => (savedOnly ? saved : { ...removedFromPipeline, ...saved }), [savedOnly, saved, removedFromPipeline]);
  const filterResult = useMemo(() => applyJobFilters(listed, jobs, matches, rejected, kept, effective, hour, field, inPipeline), [listed, jobs, matches, rejected, kept, effective, hour, field, inPipeline]);
  const results = useMemo(() => {
    const list = savedOnly && query.trim() ? filterResult.visibleIds.filter((id) => savedTextMatches(jobs[id], query)) : [...filterResult.visibleIds];
    // A job just taken out of the Pipeline (the last day) leads Find, so the candidate sees where it went.
    const back = (id: string) => (!savedOnly && removedFromPipeline[id] && hour - Date.parse(removedFromPipeline[id]) < 86_400_000 ? removedFromPipeline[id] : "");
    list.sort((a, b) => {
      if (back(a) || back(b)) return back(b).localeCompare(back(a));
      if (sort === "date") return jobs[b].postedAt.localeCompare(jobs[a].postedAt);
      if (sort === "salary") return (jobs[b].salaryMax ?? 0) - (jobs[a].salaryMax ?? 0);
      // With words in the box, best match is how well a job answers them first, then how well it fits the profile.
      const rel = filterResult.relevance;
      const score = (id: string) => (rel ? 0.55 * (rel[id] ?? 0) * 100 + 0.45 * (matches[id]?.score ?? 0) : (matches[id]?.score ?? 0));
      return score(b) - score(a) || jobs[b].postedAt.localeCompare(jobs[a].postedAt);
    });
    return list;
  }, [filterResult, jobs, matches, sort, savedOnly, query, removedFromPipeline, hour]);

  const visible = results.slice(0, limit);
  // "Showing 14 jobs for “iam director” in Mumbai from 2 sources" — every number from what's on screen.
  const isSearching = !!searching;
  // What the catalog on screen was searched for ("" = the Career Profile's own search).
  const searchedFor = useJobsStore((s) => s.searchedFor);
  const partTime = !savedOnly && !!effective.skipProfile;
  // Part Time before its first search: the profile's results aren't Part Time's, so it asks for words instead.
  const partTimeIdle = partTime && !searchedFor && !searching;
  const summary = useMemo(() => {
    // While a search runs its banner says what's being searched; the jobs arriving under it aren't the last search's.
    if (savedOnly || header || !searched || !results.length || isSearching) return null;
    // Part Time's list is its own words' search: say those words (their places are in them).
    if (partTime && searchedFor) {
      const count = new Set(results.flatMap((id) => (jobs[id]?.lake?.sightings.length ? jobs[id].lake!.sightings.map((x) => x.sourceId) : (jobs[id]?.sourceIds ?? [])))).size;
      return `Showing ${results.length.toLocaleString("en-IN")} ${results.length === 1 ? "job" : "jobs"} for “${effective.query.trim() || searchedFor}” from ${count} ${count === 1 ? "source" : "sources"}`;
    }
    // Full Time: what is Looking for and where is the Location pill, both just above — the line counts.
    const what = effective.query.trim();
    const sourceCount = new Set(results.flatMap((id) => (jobs[id]?.lake?.sightings.length ? jobs[id].lake!.sightings.map((x) => x.sourceId) : (jobs[id]?.sourceIds ?? [])))).size;
    const n = results.length.toLocaleString("en-IN");
    return `Showing ${n} ${results.length === 1 ? "job" : "jobs"}${what ? ` for “${what}”` : ""} from ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`;
  }, [savedOnly, header, searched, results, effective.query, jobs, isSearching, partTime, searchedFor]);
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
        filters={effective}
        views={!savedOnly}
        onChange={(p) => {
          setFilters(p);
          setLimit(PAGE);
        }}
        sources={sources}
        compare={compareMode}
        onCompare={(on) => {
          setCompareMode(on);
          if (!on) setCompare([]);
        }}
        sourceSearch={sourceSearch}
        refineTop={refineTop}
        shortlist={savedOnly ? { text: savedText, onText: setSavedText } : undefined}
        className="mb-4"
      />
      {partTimeIdle ? (
        partTimeMiss ? (
          <EmptyState icon={<Search className="size-5" aria-hidden />} title={`Nothing found for “${partTimeMiss}”`} body="No source lists that right now. Try other words, or fewer of them." />
        ) : (
          <EmptyState icon={<Search className="size-5" aria-hidden />} title="Search for part-time work" body="Type the work you want — for example “weekend barista in Pune” or “freelance designer” — and press Search." />
        )
      ) : results.length === 0 ? (
        searching && !savedOnly ? (
          searching
        ) : filterResult.hiddenTotal > 0 && !savedOnly ? (
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
        ) : savedOnly && Object.keys(saved).some((id) => jobs[id]) ? (
          // Saved jobs exist, but the words or job types hide them all.
          <p role="status" className="rounded-[14px] border border-dashed border-line p-6 text-center text-[14px] text-ink-2">
            No saved job matches{query.trim() ? ` “${query.trim()}”` : " these filters"}.{" "}
            <button
              type="button"
              onClick={() => {
                setSavedText("");
                setFilters({ jobTypes: [], hideInPipeline: false });
              }}
              className="font-medium text-brand-600 hover:underline"
            >
              Clear
            </button>
          </p>
        ) : (
          empty
        )
      ) : (
        <>
          <h2 className="wj-sr-only">Job results</h2>
          {/* How many, from where — and the order they're in. */}
          {(summary || !savedOnly) && (
            <div className="mb-3 flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] text-ink-3">{summary}</p>
              {!savedOnly && <SortMenu />}
            </div>
          )}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Job results">
            {visible.map((id) => (
              <li key={id}>
                <JobResult
                  id={id}
                  job={jobs[id]}
                  match={matches[id]}
                  saved={!!saved[id]}
                  onToggleSave={toggleSave}
                  status={closed[id] ? "posting closed" : appByJob.get(id) ? appByJob.get(id)!.status.replace(/_/g, " ") : removedFromPipeline[id] ? "Removed from Pipeline" : undefined}
                  compareSelected={compare.includes(id)}
                  onToggleCompare={compareMode ? toggleCompare : undefined}
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
      {results.length > 0 && !savedOnly && !partTimeIdle && (
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

/** One card in the results, with its id-taking handlers bound here so the card itself can skip re-renders. */
const JobResult = memo(function JobResult({ id, onToggleSave, onToggleCompare, ...card }: { id: string; job: CanonicalJob; match?: JobMatch; saved: boolean; status?: string; compareSelected: boolean; onToggleSave: (id: string) => void; onToggleCompare?: (id: string) => void }) {
  return <JobCard {...card} onToggleSave={() => onToggleSave(id)} onToggleCompare={onToggleCompare ? () => onToggleCompare(id) : undefined} />;
});
