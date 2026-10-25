"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { CanonicalJob, JobFilters, JobMatch, JobQuality, JobSort, JobSource } from "@/domain/jobs/types";
import { JOB_SOURCES, reconcileSources } from "@/domain/jobs/sources";
import { getClientMode } from "@/lib/mode";
import { getUniverse } from "@/services/mock/universe";
import { computeMatch, computeQuality, deduplicate } from "@/services/jobs/matching";
import { blendAiFit, profileKey, type AiFit } from "@/domain/jobs/aiFit";
import type { RejectionReason } from "@/domain/career/learning";
import { useCareerStore } from "./career";
import type { InteractionRecord } from "@/domain/career/learning";

/** What the learning loop keeps about a job the candidate chose. */
export function interactionFor(job: CanonicalJob, kind: InteractionRecord["kind"]): InteractionRecord {
  return { jobId: job.id, at: new Date().toISOString(), kind, industry: job.industry, workMode: job.workMode, title: job.title, company: job.company };
}
import { track } from "@/lib/analytics";
import { placesOnly } from "@/domain/jobs/searchScope";
import { FIND_MODE_PATCH, findModeOf, readRefine, refineDefaults, refineOf, sameRefine, type FindMode, type RefineSettings } from "@/domain/jobs/findMode";

export const DEFAULT_FILTERS: JobFilters = { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false };

interface JobsState {
  sources: JobSource[];
  /** Canonical jobs known to the product (last run's universe). */
  jobs: Record<string, CanonicalJob>;
  order: string[];
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  /** A model's fit read per job (domain/jobs/aiFit.ts), blended into the rule-based match within a fixed band. */
  aiFits: Record<string, AiFit>;
  saved: Record<string, string>; // jobId → savedAt
  rejected: Record<string, string>;
  /** Postings found to have closed on the employer's or board's own site (jobId → when and why). They leave the
   *  catalog and aren't added back by a search for a week; a saved job stays, flagged, so nothing the candidate kept disappears. */
  closed: Record<string, { at: string; reason: string }>;
  /** When each job's original link was last found open (jobId → ISO time), so it isn't re-checked every visit. */
  linkOpenAt: Record<string, string>;
  markClosed: (jobId: string, reason: string) => void;
  markLinkOpen: (jobIds: string[]) => void;
  /** When the candidate last opened a job's Apply on the employer's site (jobId → ISO time): its page then asks how it went. */
  applyOpenedAt: Record<string, string>;
  markApplyOpened: (jobId: string) => void;
  /** For a job board's posting (Adzuna): the site it lives on, as found by following its link (jobId → "naukri.com"). */
  origins: Record<string, string>;
  setOrigins: (byJob: Record<string, string>) => void;
  filters: JobFilters;
  sort: JobSort;
  loaded: boolean;
  /** What the candidate typed for the search behind this catalog ("" = their profile's search), so a rescore keeps judging the jobs on it. */
  searchedFor: string;
  /** Part Time's last few searches, newest first (owner, 2026-10-22): only what the candidate typed and searched. */
  recentSearches: string[];
  /** A typed search ran: it goes to the top of the history (once, whatever its case). */
  rememberSearch: (text: string, where?: SearchHistoryOf) => void;
  /** The candidate's × on one history item. */
  forgetSearch: (text: string, where?: SearchHistoryOf) => void;
  /** Saved's own last few filter words, newest first, kept apart from Find's. */
  recentSavedSearches: string[];
  loadInitial: () => void;
  /** Re-score the catalog against the current Career DNA (after onboarding / DNA edits). */
  rescore: () => void;
  /** Compares one job with the Career Profile when it has no match yet (a job opened from Saved, Pipeline or a link, outside Find's list). */
  scoreOne: (id: string) => void;
  replaceCatalog: (jobs: CanonicalJob[], searchedFor?: string) => void;
  /** A running search's later arrivals, added after what's already listed (the run's final `replaceCatalog` settles the list). */
  appendCatalog: (jobs: CanonicalJob[]) => void;
  /** The profile's results as they were before a search for typed words replaced them (this session only). */
  beforeWords?: { jobs: Record<string, CanonicalJob>; order: string[]; matches: Record<string, JobMatch> };
  /** Clearing the typed words: bring the profile's results back. False when there's nothing kept to restore. */
  restoreProfileCatalog: () => boolean;
  /** The typed words' results, set aside when the profile's came back (Find's Full Time), this session only. */
  wordsCatalog?: { jobs: Record<string, CanonicalJob>; order: string[]; matches: Record<string, JobMatch>; searchedFor: string };
  /** Back to Part Time: the words' results set aside, if any, with the profile's kept aside again. False when none. */
  restoreWordsCatalog: () => boolean;
  /** The list as it was when a search started (this session only), so Stop can bring it back. */
  beforeRun?: { runId: string } & Pick<JobsState, "jobs" | "order" | "matches" | "searchedFor" | "beforeWords" | "wordsCatalog">;
  /** Called as a search starts: keeps the list as it is now. */
  keepBeforeRun: (runId: string) => void;
  /** Stop: the list as it was before that search started. False when nothing was kept for it. */
  restoreBeforeRun: (runId: string) => boolean;
  setMatches: (matches: JobMatch[]) => void;
  setAiFits: (fits: Record<string, AiFit>) => void;
  setQuality: (quality: JobQuality[]) => void;
  save: (jobId: string) => void;
  unsave: (jobId: string) => void;
  reject: (jobId: string, reason?: RejectionReason) => void;
  unreject: (jobId: string) => void;
  setFilters: (patch: Partial<JobFilters>) => void;
  setSort: (sort: JobSort) => void;
  /** Each Find mode's own Refine settings, kept between sessions (findMode.ts). */
  refine: Partial<Record<FindMode, RefineSettings>>;
  /** Find's slider: that mode's filters, with its own Refine settings back. */
  switchFindMode: (mode: FindMode) => void;
  /** Part Time's search words, kept while Full Time is on screen (and across reloads), so coming back shows them again. */
  partTimeQuery: string;
  setSourceEnabled: (id: string, enabled: boolean) => void;
  /** From the server: which sources this deployment can query. */
  setSourceAvailability: (available: Record<string, boolean>) => void;
  /** Put back jobs the candidate saved or applied to that dropped out of the catalog (found again on the server); the results list is unchanged. */
  restoreJobs: (jobs: CanonicalJob[]) => void;
  /** Jobs taken out of the Pipeline (jobId → when): back in the results, saying so on the card. */
  removedFromPipeline: Record<string, string>;
  /** A job whose application was removed from the Pipeline: back in Find's results (not hidden as not-for-me), marked as such. */
  returnFromPipeline: (jobId: string, job?: CanonicalJob) => void;
}

/** The jobs the candidate saved that are still known — kept whatever a new search returns. */
const savedJobs = (s: { jobs: Record<string, CanonicalJob>; saved: Record<string, string> }) => Object.fromEntries(Object.keys(s.saved).flatMap((id) => (s.jobs[id] ? [[id, s.jobs[id]] as const] : [])));

/** How much of the catalog a signed-in account keeps between sessions (the rest is re-discovered by runs). */
const PERSISTED_CATALOG = 300;
const PERSISTED_DESCRIPTION = 1500;
/** How many of the profile's results set aside under a typed search are kept between sessions. */
const PERSISTED_ASIDE = 150;

/** What a job is scored against for place and pay: the mode's Refine (as every search is), not the Career Profile's. */
const matchScope = (f: JobFilters, dna: { preferredLocations: string[] }) => ({ preferredLocations: placesOnly(f.locations ?? (f.skipProfile ? [] : dna.preferredLocations)) ?? [], minSalary: f.minSalary });

/** New filters or sort, and what they set in Refine kept for their mode (the same object while nothing in it changed). */
function withRefine(s: JobsState, filters: JobFilters, sort: JobSort): Pick<JobsState, "filters" | "sort" | "refine"> {
  const mode = findModeOf(filters);
  const now = refineOf(filters, sort);
  return { filters, sort, refine: sameRefine(s.refine[mode], now) ? s.refine : { ...s.refine, [mode]: now } };
}

function restoredRefine(p: { refine?: unknown; hideInPipeline?: boolean; savedEasyApply?: boolean; skipProfile?: boolean; sort?: JobSort; partTimeQuery?: unknown }, filters: JobFilters): Pick<JobsState, "refine" | "filters" | "sort" | "partTimeQuery"> {
  const raw = (p.refine && typeof p.refine === "object" ? p.refine : {}) as Record<string, unknown>;
  const refine: JobsState["refine"] = {};
  for (const m of ["full_time", "part_time"] as const) {
    const r = readRefine(raw[m]);
    if (r) refine[m] = r;
  }
  const mode: FindMode = p.skipProfile ? "part_time" : "full_time";
  const { sort, ...narrowing } = refine[mode] ?? { ...refineDefaults(mode), hideInPipeline: !!p.hideInPipeline, sort: p.sort ?? "best_match" };
  // The mode's start, then everything kept for it (places, job types and view included); Part Time's words too.
  const partTimeQuery = typeof p.partTimeQuery === "string" ? p.partTimeQuery.slice(0, 200) : "";
  return { refine, sort, partTimeQuery, filters: { ...filters, ...FIND_MODE_PATCH[mode], ...narrowing, ...(p.savedEasyApply ? { savedEasyApply: true } : {}), ...(mode === "part_time" ? { query: partTimeQuery } : {}) } };
}

/** How many searches each history keeps. */
export const RECENT_SEARCHES = 5;

/** Which box a search history belongs to: Find's Part Time search, or Saved's filter. */
export type SearchHistoryOf = "find" | "saved";
const HISTORY_KEY = { find: "recentSearches", saved: "recentSavedSearches" } as const satisfies Record<SearchHistoryOf, keyof JobsState>;
const readHistory = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_SEARCHES) : []);

export const useJobsStore = create<JobsState>()(
  persist(
    (set, get) => ({
      sources: JOB_SOURCES,
      jobs: {},
      order: [],
      matches: {},
      quality: {},
      aiFits: {},
      saved: {},
      rejected: {},
      closed: {},
      linkOpenAt: {},
      applyOpenedAt: {},
      origins: {},
      markClosed: (jobId, reason) =>
        set((s) => {
          const closed = { ...s.closed, [jobId]: { at: new Date().toISOString(), reason } };
          if (s.saved[jobId]) {
            const j = s.jobs[jobId];
            if (!s.closed[jobId] && j) useCareerStore.getState().notify({ category: "job_closed", title: `A saved job closed: ${j.company}`, body: `${j.title} — ${reason}`, href: "/app/saved", action: "See saved jobs" });
            return { closed };
          }
          return { closed, order: s.order.filter((id) => id !== jobId) };
        }),
      setOrigins: (byJob) => set((s) => ({ origins: { ...s.origins, ...byJob } })),
      markApplyOpened: (id) => set((s) => ({ applyOpenedAt: { ...s.applyOpenedAt, [id]: new Date().toISOString() } })),
      markLinkOpen: (ids) => set((s) => ({ linkOpenAt: { ...s.linkOpenAt, ...Object.fromEntries(ids.map((id) => [id, new Date().toISOString()])) } })),
      filters: DEFAULT_FILTERS,
      sort: "best_match",
      loaded: false,
      searchedFor: "",
      recentSearches: [],
      recentSavedSearches: [],
      rememberSearch: (text, where = "find") =>
        set((s) => {
          const t = text.replace(/\s+/g, " ").trim().slice(0, 80);
          if (!t) return {};
          const key = HISTORY_KEY[where];
          return { [key]: [t, ...s[key].filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_SEARCHES) };
        }),
      forgetSearch: (text, where = "find") => set((s) => ({ [HISTORY_KEY[where]]: s[HISTORY_KEY[where]].filter((x) => x !== text) })),
      loadInitial: () => {
        if (get().loaded) return;
        if (getClientMode().mode === "user") {
          // Real accounts only know jobs their runs discovered (already rehydrated); nothing is invented.
          set({ loaded: true });
          return;
        }
        const canonical = deduplicate(getUniverse().jobs);
        const sources = Object.fromEntries(get().sources.map((s) => [s.id, s]));
        const dna = useCareerStore.getState().dna;
        const jobs: Record<string, CanonicalJob> = {};
        const matches: Record<string, JobMatch> = {};
        const quality: Record<string, JobQuality> = {};
        const learnedSignals = useCareerStore.getState().learnedSignals;
        for (const j of canonical) {
          jobs[j.id] = j;
          matches[j.id] = computeMatch(j, { dna, learnedSignals, ...matchScope(get().filters, dna) });
          quality[j.id] = computeQuality(j, sources);
        }
        set({ jobs, order: canonical.map((j) => j.id), matches, quality, loaded: true });
      },
      rescore: () => {
        const { jobs, order, loaded, aiFits } = get();
        if (!loaded) return;
        const { dna, learnedSignals } = useCareerStore.getState();
        const searchQuery = get().searchedFor || undefined;
        const profile = profileKey(dna);
        const matches: Record<string, JobMatch> = {};
        const scope = matchScope(get().filters, dna);
        for (const id of order) matches[id] = blendAiFit(computeMatch(jobs[id], { dna, learnedSignals, searchQuery, ...scope }), aiFits[id], profile);
        set({ matches });
      },
      scoreOne: (id) => {
        const { jobs, matches, aiFits } = get();
        if (!jobs[id] || matches[id]) return;
        const { dna, learnedSignals } = useCareerStore.getState();
        const m = blendAiFit(computeMatch(jobs[id], { dna, learnedSignals, searchQuery: get().searchedFor || undefined, ...matchScope(get().filters, dna) }), aiFits[id], profileKey(dna));
        set((s) => ({ matches: { ...s.matches, [id]: m } }));
      },
      replaceCatalog: (list, searchedFor = "") =>
        set((s) => {
          // A posting found closed in the last week isn't brought back by a source that still lists it.
          const recent = Date.now() - 7 * 86_400_000;
          const live = list.filter((j) => !(s.closed[j.id] && Date.parse(s.closed[j.id].at) > recent && !s.saved[j.id]));
          // Words searched on top of the profile's results keep those results aside, so clearing the words brings them back.
          const beforeWords = !searchedFor ? undefined : s.searchedFor ? s.beforeWords : s.order.length ? { jobs: s.jobs, order: s.order, matches: Object.fromEntries(s.order.flatMap((id) => (s.matches[id] ? [[id, s.matches[id]] as const] : []))) } : undefined;
          return { jobs: { ...savedJobs(s), ...Object.fromEntries(live.map((j) => [j.id, j])) }, order: live.map((j) => j.id), loaded: true, searchedFor, beforeWords };
        }),
      appendCatalog: (list) =>
        set((s) => {
          const recent = Date.now() - 7 * 86_400_000;
          const fresh = list.filter((j) => !s.order.includes(j.id) && !(s.closed[j.id] && Date.parse(s.closed[j.id].at) > recent && !s.saved[j.id]));
          if (!fresh.length) return {};
          return { jobs: { ...s.jobs, ...Object.fromEntries(fresh.map((j) => [j.id, j])) }, order: [...s.order, ...fresh.map((j) => j.id)] };
        }),
      restoreProfileCatalog: () => {
        const kept = get().beforeWords;
        if (!kept) return false;
        const recent = Date.now() - 7 * 86_400_000;
        const order = kept.order.filter((id) => kept.jobs[id] && !(get().closed[id] && Date.parse(get().closed[id].at) > recent && !get().saved[id]));
        // The profile search's own scores come back too (the words' search re-scored any job both found).
        // The words' results are set aside, so going back to them (Part Time) shows them again.
        set((s) => ({
          jobs: { ...savedJobs(s), ...kept.jobs },
          order,
          matches: { ...s.matches, ...kept.matches },
          searchedFor: "",
          beforeWords: undefined,
          wordsCatalog: s.searchedFor && s.order.length ? { jobs: Object.fromEntries(s.order.flatMap((id) => (s.jobs[id] ? [[id, s.jobs[id]] as const] : []))), order: s.order, matches: Object.fromEntries(s.order.flatMap((id) => (s.matches[id] ? [[id, s.matches[id]] as const] : []))), searchedFor: s.searchedFor } : s.wordsCatalog,
        }));
        return true;
      },
      keepBeforeRun: (runId) => set((s) => ({ beforeRun: { runId, jobs: s.jobs, order: s.order, matches: s.matches, searchedFor: s.searchedFor, beforeWords: s.beforeWords, wordsCatalog: s.wordsCatalog } })),
      restoreBeforeRun: (runId) => {
        const kept = get().beforeRun;
        if (!kept || kept.runId !== runId) return false;
        const { runId: _id, ...was } = kept;
        void _id;
        // Saved jobs found by the stopped search stay saved.
        set((s) => ({ ...was, jobs: { ...savedJobs(s), ...was.jobs }, beforeRun: undefined }));
        return true;
      },
      restoreWordsCatalog: () => {
        const kept = get().wordsCatalog;
        if (!kept) return false;
        set((s) => ({
          jobs: { ...savedJobs(s), ...kept.jobs },
          order: kept.order,
          matches: { ...s.matches, ...kept.matches },
          searchedFor: kept.searchedFor,
          // The profile's results go aside again, for the way back to Full Time.
          beforeWords: s.searchedFor ? s.beforeWords : s.order.length ? { jobs: s.jobs, order: s.order, matches: Object.fromEntries(s.order.flatMap((id) => (s.matches[id] ? [[id, s.matches[id]] as const] : []))) } : s.beforeWords,
          wordsCatalog: undefined,
        }));
        return true;
      },
      setMatches: (list) => set((s) => ({ matches: { ...s.matches, ...Object.fromEntries(list.map((m) => [m.jobId, m])) } })),
      setAiFits: (fits) => set((s) => ({ aiFits: { ...s.aiFits, ...fits } })),
      setQuality: (list) => set((s) => ({ quality: { ...s.quality, ...Object.fromEntries(list.map((q) => [q.jobId, q])) } })),
      save: (jobId) => {
        track("job_saved", { jobId });
        track("opportunity_saved", { jobId, fit: get().matches[jobId]?.fit });
        set((s) => {
          const rejected = { ...s.rejected };
          delete rejected[jobId];
          return { saved: { ...s.saved, [jobId]: new Date().toISOString() }, rejected };
        });
        // Saving is evidence of what the candidate wants: learned the same way as "not for me".
        const saved = get().jobs[jobId];
        if (saved) useCareerStore.getState().recordInteraction(interactionFor(saved, "saved"));
      },
      unsave: (jobId) => {
        set((s) => {
          const saved = { ...s.saved };
          delete saved[jobId];
          return { saved };
        });
        useCareerStore.getState().clearInteraction(jobId, "saved");
      },
      reject: (jobId, reason) => {
        track("job_rejected", { jobId, reason: reason ?? "none" });
        track("opportunity_rejected", { jobId, reason: reason ?? "none", fit: get().matches[jobId]?.fit });
        const job = get().jobs[jobId];
        const at = new Date().toISOString();
        set((s) => {
          const saved = { ...s.saved };
          delete saved[jobId];
          return { rejected: { ...s.rejected, [jobId]: at }, saved };
        });
        // Every rejection feeds the learning loop (spec: "not for me" must actually influence future
        // ranking), whether or not the candidate gave a reason — a reason is what lets it target a
        // specific pattern (industry, work mode, seniority); without one it's just recorded.
        if (job) useCareerStore.getState().recordRejection({ jobId, at, reason, industry: job.industry, workMode: job.workMode, title: job.title, company: job.company });
        get().rescore();
      },
      unreject: (jobId) => {
        set((s) => {
          const rejected = { ...s.rejected };
          delete rejected[jobId];
          return { rejected };
        });
        useCareerStore.getState().clearRejection(jobId);
        get().rescore();
      },
      restoreJobs: (list) => set((s) => ({ jobs: { ...Object.fromEntries(list.map((j) => [j.id, j])), ...s.jobs } })),
      removedFromPipeline: {},
      returnFromPipeline: (jobId, job) =>
        set((s) => {
          const rejected = { ...s.rejected };
          delete rejected[jobId];
          const jobs = job && !s.jobs[jobId] ? { ...s.jobs, [jobId]: job } : s.jobs;
          // In the list on screen again, first, when the job is known.
          const order = jobs[jobId] && !s.order.includes(jobId) ? [jobId, ...s.order] : s.order;
          return { jobs, order, rejected, removedFromPipeline: { ...s.removedFromPipeline, [jobId]: new Date().toISOString() } };
        }),
      setFilters: (patch) => set((s) => withRefine(s, { ...s.filters, ...patch }, s.sort)),
      setSort: (sort) => set((s) => withRefine(s, s.filters, sort)),
      refine: {},
      partTimeQuery: "",
      switchFindMode: (mode) =>
        set((s) => {
          const kept = s.refine[mode] ?? refineDefaults(mode);
          const { sort, ...narrowing } = kept;
          // Leaving Part Time keeps its words; coming back puts them in the box again.
          const leaving = findModeOf(s.filters);
          const partTimeQuery = leaving === "part_time" ? s.filters.query : s.partTimeQuery;
          const words = mode === "part_time" ? { query: partTimeQuery } : {};
          return { ...withRefine(s, { ...s.filters, ...FIND_MODE_PATCH[mode], ...narrowing, ...words }, sort), partTimeQuery };
        }),
      setSourceEnabled: (id, enabled) => set((s) => ({ sources: s.sources.map((x) => (x.id === id ? { ...x, enabled, chosen: true } : x)) })),
      setSourceAvailability: (available) =>
        set((s) => ({
          sources: s.sources.map((x) => {
            const now = available[x.id] ?? x.available;
            // A credentialed source: off while the server can't search it; on once it can, unless the candidate switched it off.
            const enabled = x.requiresSetup && now === false ? false : x.requiresSetup && now === true && !x.chosen ? (JOB_SOURCES.find((r) => r.id === x.id)?.enabled ?? x.enabled) : x.enabled;
            return { ...x, available: now, enabled };
          }),
        })),
    }),
    {
      name: "wj.jobs",
      storage: createRemoteStorage(),
      skipHydration: true,
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<JobsState> & { hideInPipeline?: boolean; savedEasyApply?: boolean; skipProfile?: boolean };
        // Each mode's Refine settings, and the last-used mode's applied to the filters (before WJ-355 only Hide Pipeline was kept).
        return { ...current, ...p, aiFits: p.aiFits ?? {}, sources: reconcileSources(p.sources, Object.fromEntries(current.sources.map((x) => [x.id, x.available]))), jobs: p.jobs ?? {}, order: p.order ?? [], matches: p.matches ?? {}, quality: p.quality ?? {}, closed: p.closed ?? {}, removedFromPipeline: p.removedFromPipeline ?? {}, linkOpenAt: p.linkOpenAt ?? {}, applyOpenedAt: p.applyOpenedAt ?? {}, origins: p.origins ?? {}, recentSearches: readHistory(p.recentSearches), recentSavedSearches: readHistory(p.recentSavedSearches), ...restoredRefine(p, current.filters) };
      },
      // Demo/local: the catalog is regenerated deterministically, only decisions persist.
      // Signed-in: the best of the last discovery persists too, so the product remembers real jobs between sessions.
      partialize: (s) => {
        const recent = Date.now() - 7 * 86_400_000;
        const closed = Object.fromEntries(Object.entries(s.closed ?? {}).filter(([, c]) => Date.parse(c.at) > recent).slice(-500));
        const linkOpenAt = Object.fromEntries(Object.entries(s.linkOpenAt ?? {}).filter(([id]) => s.jobs[id]).slice(-500));
        const origins = Object.fromEntries(Object.entries(s.origins ?? {}).filter(([id]) => s.jobs[id]).slice(-500));
        const applyOpenedAt = Object.fromEntries(Object.entries(s.applyOpenedAt ?? {}).slice(-300));
        // Hide Pipeline is the one filter kept between sessions (owner, 2026-10-17); the rest start fresh.
        const removedFromPipeline = Object.fromEntries(Object.entries(s.removedFromPipeline ?? {}).slice(-300));
        const base = { removedFromPipeline, saved: s.saved, rejected: s.rejected, sources: s.sources, sort: s.sort, closed, linkOpenAt, applyOpenedAt, origins, searchedFor: s.searchedFor, recentSearches: s.recentSearches, recentSavedSearches: s.recentSavedSearches, refine: s.refine, hideInPipeline: !!s.filters.hideInPipeline, savedEasyApply: !!s.filters.savedEasyApply, skipProfile: !!s.filters.skipProfile, partTimeQuery: findModeOf(s.filters) === "part_time" ? s.filters.query : s.partTimeQuery };
        if (getClientMode().mode !== "user") return base;
        return { ...base, ...persistedCatalog(s) };
      },
    },
  ),
);

/**
 * The part of the catalog a signed-in account keeps between sessions. Persisting runs on every change to the
 * store — a filter keystroke, a link check — so this, the expensive part (sorting and copying up to 300 jobs),
 * is recomputed only when what it's made from changed.
 */
let catalogMemo: { from: unknown[]; out: Pick<JobsState, "jobs" | "order" | "matches" | "quality" | "aiFits" | "beforeWords" | "wordsCatalog"> } | null = null;
function persistedCatalog(s: JobsState) {
  const from = [s.jobs, s.order, s.matches, s.quality, s.aiFits, s.saved, s.beforeWords, s.wordsCatalog];
  if (catalogMemo && catalogMemo.from.every((x, i) => x === from[i])) return catalogMemo.out;
  const out = buildPersistedCatalog(s);
  catalogMemo = { from, out };
  return out;
}

function buildPersistedCatalog(s: JobsState) {
  const keep = new Set<string>(Object.keys(s.saved));
  for (const id of [...s.order].sort((a, b) => (s.matches[b]?.score ?? 0) - (s.matches[a]?.score ?? 0))) {
    if (keep.size >= PERSISTED_CATALOG) break;
    keep.add(id);
  }
  const order = s.order.filter((id) => keep.has(id));
  const jobs: Record<string, CanonicalJob> = {};
  const matches: Record<string, JobMatch> = {};
  const quality: Record<string, JobQuality> = {};
  // Every saved job is kept, in the results or not — saving it is how the candidate said to keep it.
  for (const id of keep) {
    const j = s.jobs[id];
    if (!j) continue;
    // Kept short in storage; the trailing "…" tells the job page it has only the start.
    jobs[id] = j.description.length > PERSISTED_DESCRIPTION ? { ...j, description: `${j.description.slice(0, PERSISTED_DESCRIPTION).trimEnd()}…` } : j;
    if (s.matches[id]) matches[id] = s.matches[id];
    if (s.quality[id]) quality[id] = s.quality[id];
  }
  const aiFits = Object.fromEntries(order.filter((id) => s.aiFits?.[id]).map((id) => [id, s.aiFits[id]]));
  // The profile's results set aside while typed words are searched: kept too, so clearing the words after
  // the phone reloads the tab brings them back instead of searching again.
  const beforeWords = trimAside(s.beforeWords);
  // Part Time's last results, set aside while Full Time shows the profile's: kept too, so Part Time shows
  // them after the app is reopened instead of asking to search again.
  const words = trimAside(s.wordsCatalog);
  const wordsCatalog = words && s.wordsCatalog ? { ...words, searchedFor: s.wordsCatalog.searchedFor } : undefined;
  return { jobs, order, matches, quality, aiFits, beforeWords, wordsCatalog };
}

/** A set-aside list kept in storage: its best PERSISTED_ASIDE jobs, descriptions shortened. */
function trimAside(aside: Pick<JobsState, "jobs" | "order" | "matches"> | undefined) {
  const asideOrder = aside ? [...aside.order].sort((a, b) => (aside.matches[b]?.score ?? 0) - (aside.matches[a]?.score ?? 0)).slice(0, PERSISTED_ASIDE).filter((id) => aside.jobs[id]) : [];
  return aside && asideOrder.length
    ? {
        order: aside.order.filter((id) => asideOrder.includes(id)),
        jobs: Object.fromEntries(asideOrder.map((id) => { const j = aside.jobs[id]; return [id, (j.description?.length ?? 0) > PERSISTED_DESCRIPTION ? { ...j, description: `${j.description.slice(0, PERSISTED_DESCRIPTION).trimEnd()}…` } : j]; })),
        matches: Object.fromEntries(asideOrder.flatMap((id) => (aside.matches[id] ? [[id, aside.matches[id]] as const] : []))),
      }
    : undefined;
}
