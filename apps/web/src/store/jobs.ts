"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { remoteStorage } from "./remoteStorage";
import type { CanonicalJob, JobFilters, JobMatch, JobQuality, JobSort, JobSource } from "@/domain/jobs/types";
import { JOB_SOURCES } from "@/services/mock/catalog";
import { getUniverse } from "@/services/mock/universe";
import { computeMatch, computeQuality, deduplicate } from "@/services/jobs/matching";
import { SEED_DNA } from "@/services/mock/seed";
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
}

export const useJobsStore = create<JobsState>()(
  persist(
    (set, get) => ({
      sources: JOB_SOURCES,
      jobs: {},
      order: [],
      matches: {},
      quality: {},
      saved: { job_google_pm: new Date().toISOString(), job_amazon_growth: new Date().toISOString(), job_airbnb_pm: new Date().toISOString() },
      rejected: {},
      filters: DEFAULT_FILTERS,
      sort: "best_match",
      loaded: false,
      loadInitial: () => {
        if (get().loaded) return;
        const canonical = deduplicate(getUniverse().jobs);
        const sources = Object.fromEntries(get().sources.map((s) => [s.id, s]));
        const jobs: Record<string, CanonicalJob> = {};
        const matches: Record<string, JobMatch> = {};
        const quality: Record<string, JobQuality> = {};
        for (const j of canonical) {
          jobs[j.id] = j;
          matches[j.id] = computeMatch(j, { dna: SEED_DNA });
          quality[j.id] = computeQuality(j, sources);
        }
        set({ jobs, order: canonical.map((j) => j.id), matches, quality, loaded: true });
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
    }),
    {
      name: "wj.jobs",
      storage: createJSONStorage(() => remoteStorage),
      skipHydration: true,
      version: 1,
      // The catalog is regenerated deterministically; only user decisions persist.
      partialize: (s) => ({ saved: s.saved, rejected: s.rejected, sources: s.sources, sort: s.sort }),
    },
  ),
);
