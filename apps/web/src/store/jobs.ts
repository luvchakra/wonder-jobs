"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { CanonicalJob, JobFilters, JobMatch, JobQuality, JobSort, JobSource } from "@/domain/jobs/types";
import { JOB_SOURCES, reconcileSources } from "@/domain/jobs/sources";
import { getClientMode } from "@/lib/mode";
import { getUniverse } from "@/services/mock/universe";
import { computeMatch, computeQuality, deduplicate } from "@/services/jobs/matching";
import { useCareerStore } from "./career";
import { track } from "@/lib/analytics";

export const DEFAULT_FILTERS: JobFilters = { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false };

interface JobsState {
  sources: JobSource[];
  /** Canonical jobs known to the product (last run's universe). */
  jobs: Record<string, CanonicalJob>;
  order: string[];
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  saved: Record<string, string>; // jobId → savedAt
  rejected: Record<string, string>;
  filters: JobFilters;
  sort: JobSort;
  loaded: boolean;
  loadInitial: () => void;
  /** Re-score the catalog against the current Career DNA (after onboarding / DNA edits). */
  rescore: () => void;
  replaceCatalog: (jobs: CanonicalJob[]) => void;
  setMatches: (matches: JobMatch[]) => void;
  setQuality: (quality: JobQuality[]) => void;
  save: (jobId: string) => void;
  unsave: (jobId: string) => void;
  reject: (jobId: string) => void;
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
      saved: {},
      rejected: {},
      filters: DEFAULT_FILTERS,
      sort: "best_match",
      loaded: false,
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
        for (const j of canonical) {
          jobs[j.id] = j;
          matches[j.id] = computeMatch(j, { dna });
          quality[j.id] = computeQuality(j, sources);
        }
        set({ jobs, order: canonical.map((j) => j.id), matches, quality, loaded: true });
      },
      rescore: () => {
        const { jobs, order, loaded } = get();
        if (!loaded) return;
        const dna = useCareerStore.getState().dna;
        const matches: Record<string, JobMatch> = {};
        for (const id of order) matches[id] = computeMatch(jobs[id], { dna });
        set({ matches });
      },
      replaceCatalog: (list) => set({ jobs: Object.fromEntries(list.map((j) => [j.id, j])), order: list.map((j) => j.id), loaded: true }),
      setMatches: (list) => set((s) => ({ matches: { ...s.matches, ...Object.fromEntries(list.map((m) => [m.jobId, m])) } })),
      setQuality: (list) => set((s) => ({ quality: { ...s.quality, ...Object.fromEntries(list.map((q) => [q.jobId, q])) } })),
      save: (jobId) => {
        track("job_saved", { jobId });
        set((s) => {
          const rejected = { ...s.rejected };
          delete rejected[jobId];
          return { saved: { ...s.saved, [jobId]: new Date().toISOString() }, rejected };
        });
      },
      unsave: (jobId) =>
        set((s) => {
          const saved = { ...s.saved };
          delete saved[jobId];
          return { saved };
        }),
      reject: (jobId) => {
        track("job_rejected", { jobId });
        set((s) => {
          const saved = { ...s.saved };
          delete saved[jobId];
          return { rejected: { ...s.rejected, [jobId]: new Date().toISOString() }, saved };
        });
      },
      unreject: (jobId) =>
        set((s) => {
          const rejected = { ...s.rejected };
          delete rejected[jobId];
          return { rejected };
        }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setSort: (sort) => set({ sort }),
      setSourceEnabled: (id, enabled) => set((s) => ({ sources: s.sources.map((x) => (x.id === id ? { ...x, enabled } : x)) })),
      setSourceAvailability: (available) => set((s) => ({ sources: s.sources.map((x) => ({ ...x, available: available[x.id] ?? x.available, enabled: x.requiresSetup && available[x.id] === false ? false : x.enabled })) })),
    }),
    {
      name: "wj.jobs",
      storage: createRemoteStorage(),
      skipHydration: true,
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<JobsState>;
        return { ...current, ...p, sources: reconcileSources(p.sources), jobs: p.jobs ?? {}, order: p.order ?? [], matches: p.matches ?? {}, quality: p.quality ?? {} };
      },
      // Demo/local: the catalog is regenerated deterministically, only decisions persist.
      // Signed-in: the best of the last discovery persists too, so the product remembers real jobs between sessions.
      partialize: (s) => {
        const base = { saved: s.saved, rejected: s.rejected, sources: s.sources, sort: s.sort };
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
          jobs[id] = { ...j, description: j.description.slice(0, PERSISTED_DESCRIPTION) };
          if (s.matches[id]) matches[id] = s.matches[id];
          if (s.quality[id]) quality[id] = s.quality[id];
        }
        return { ...base, jobs, order, matches, quality };
      },
    },
  ),
);
