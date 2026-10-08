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
  /** For a job board's posting (Adzuna): the site it lives on, as found by following its link (jobId → "naukri.com"). */
  origins: Record<string, string>;
  setOrigins: (byJob: Record<string, string>) => void;
  filters: JobFilters;
  sort: JobSort;
  loaded: boolean;
  /** What the candidate typed for the search behind this catalog ("" = their profile's search), so a rescore keeps judging the jobs on it. */
  searchedFor: string;
  loadInitial: () => void;
  /** Re-score the catalog against the current Career DNA (after onboarding / DNA edits). */
  rescore: () => void;
  replaceCatalog: (jobs: CanonicalJob[], searchedFor?: string) => void;
  /** The profile's results as they were before a search for typed words replaced them (this session only). */
  beforeWords?: { jobs: Record<string, CanonicalJob>; order: string[]; matches: Record<string, JobMatch> };
  /** Clearing the typed words: bring the profile's results back. False when there's nothing kept to restore. */
  restoreProfileCatalog: () => boolean;
  setMatches: (matches: JobMatch[]) => void;
  setAiFits: (fits: Record<string, AiFit>) => void;
  setQuality: (quality: JobQuality[]) => void;
  save: (jobId: string) => void;
  unsave: (jobId: string) => void;
  reject: (jobId: string, reason?: RejectionReason) => void;
  unreject: (jobId: string) => void;
  setFilters: (patch: Partial<JobFilters>) => void;
  setSort: (sort: JobSort) => void;
  setSourceEnabled: (id: string, enabled: boolean) => void;
  /** From the server: which sources this deployment can query. */
  setSourceAvailability: (available: Record<string, boolean>) => void;
}

/** How much of the catalog a signed-in account keeps between sessions (the rest is re-discovered by runs). */
const PERSISTED_CATALOG = 300;
const PERSISTED_DESCRIPTION = 1500;

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
      origins: {},
      markClosed: (jobId, reason) =>
        set((s) => {
          const closed = { ...s.closed, [jobId]: { at: new Date().toISOString(), reason } };
          if (s.saved[jobId]) return { closed };
          return { closed, order: s.order.filter((id) => id !== jobId) };
        }),
      setOrigins: (byJob) => set((s) => ({ origins: { ...s.origins, ...byJob } })),
      markLinkOpen: (ids) => set((s) => ({ linkOpenAt: { ...s.linkOpenAt, ...Object.fromEntries(ids.map((id) => [id, new Date().toISOString()])) } })),
      filters: DEFAULT_FILTERS,
      sort: "best_match",
      loaded: false,
      searchedFor: "",
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
          matches[j.id] = computeMatch(j, { dna, learnedSignals });
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
        for (const id of order) matches[id] = blendAiFit(computeMatch(jobs[id], { dna, learnedSignals, searchQuery }), aiFits[id], profile);
        set({ matches });
      },
      replaceCatalog: (list, searchedFor = "") =>
        set((s) => {
          // A posting found closed in the last week isn't brought back by a source that still lists it.
          const recent = Date.now() - 7 * 86_400_000;
          const live = list.filter((j) => !(s.closed[j.id] && Date.parse(s.closed[j.id].at) > recent && !s.saved[j.id]));
          // Words searched on top of the profile's results keep those results aside, so clearing the words brings them back.
          const beforeWords = !searchedFor ? undefined : s.searchedFor ? s.beforeWords : s.order.length ? { jobs: s.jobs, order: s.order, matches: Object.fromEntries(s.order.flatMap((id) => (s.matches[id] ? [[id, s.matches[id]] as const] : []))) } : undefined;
          return { jobs: Object.fromEntries(live.map((j) => [j.id, j])), order: live.map((j) => j.id), loaded: true, searchedFor, beforeWords };
        }),
      restoreProfileCatalog: () => {
        const kept = get().beforeWords;
        if (!kept) return false;
        const recent = Date.now() - 7 * 86_400_000;
        const order = kept.order.filter((id) => kept.jobs[id] && !(get().closed[id] && Date.parse(get().closed[id].at) > recent && !get().saved[id]));
        // The profile search's own scores come back too (the words' search re-scored any job both found).
        set((s) => ({ jobs: kept.jobs, order, matches: { ...s.matches, ...kept.matches }, searchedFor: "", beforeWords: undefined }));
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
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setSort: (sort) => set({ sort }),
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
        const p = (persisted ?? {}) as Partial<JobsState>;
        return { ...current, ...p, aiFits: p.aiFits ?? {}, sources: reconcileSources(p.sources, Object.fromEntries(current.sources.map((x) => [x.id, x.available]))), jobs: p.jobs ?? {}, order: p.order ?? [], matches: p.matches ?? {}, quality: p.quality ?? {}, closed: p.closed ?? {}, linkOpenAt: p.linkOpenAt ?? {}, origins: p.origins ?? {} };
      },
      // Demo/local: the catalog is regenerated deterministically, only decisions persist.
      // Signed-in: the best of the last discovery persists too, so the product remembers real jobs between sessions.
      partialize: (s) => {
        const recent = Date.now() - 7 * 86_400_000;
        const closed = Object.fromEntries(Object.entries(s.closed ?? {}).filter(([, c]) => Date.parse(c.at) > recent).slice(-500));
        const linkOpenAt = Object.fromEntries(Object.entries(s.linkOpenAt ?? {}).filter(([id]) => s.jobs[id]).slice(-500));
        const origins = Object.fromEntries(Object.entries(s.origins ?? {}).filter(([id]) => s.jobs[id]).slice(-500));
        const base = { saved: s.saved, rejected: s.rejected, sources: s.sources, sort: s.sort, closed, linkOpenAt, origins, searchedFor: s.searchedFor };
        if (getClientMode().mode !== "user") return base;
        const keep = new Set<string>(Object.keys(s.saved));
        for (const id of [...s.order].sort((a, b) => (s.matches[b]?.score ?? 0) - (s.matches[a]?.score ?? 0))) {
          if (keep.size >= PERSISTED_CATALOG) break;
          keep.add(id);
        }
        const order = s.order.filter((id) => keep.has(id));
        const jobs: Record<string, CanonicalJob> = {};
        const matches: Record<string, JobMatch> = {};
        const quality: Record<string, JobQuality> = {};
        for (const id of order) {
          const j = s.jobs[id];
          if (!j) continue;
          // Kept short in storage; the trailing "…" tells the job page it has only the start.
          jobs[id] = j.description.length > PERSISTED_DESCRIPTION ? { ...j, description: `${j.description.slice(0, PERSISTED_DESCRIPTION).trimEnd()}…` } : j;
          if (s.matches[id]) matches[id] = s.matches[id];
          if (s.quality[id]) quality[id] = s.quality[id];
        }
        const aiFits = Object.fromEntries(order.filter((id) => s.aiFits?.[id]).map((id) => [id, s.aiFits[id]]));
        return { ...base, jobs, order, matches, quality, aiFits };
      },
    },
  ),
);
