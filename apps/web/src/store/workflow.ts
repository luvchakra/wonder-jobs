"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { Workflow, WorkflowRun, WorkflowSchedule } from "@/domain/workflow/types";
import { isActive } from "@/domain/workflow/status";
import { newId } from "@/lib/ids";

interface WorkflowState {
  runs: Record<string, WorkflowRun>;
  workflows: Record<string, Workflow>;
  schedules: Record<string, WorkflowSchedule>;
  upsertRun: (run: WorkflowRun) => void;
  /** Many runs at once (restoring the engine's runs on load): one store update, not one per run. */
  upsertRuns: (runs: WorkflowRun[]) => void;
  removeRun: (id: string) => void;
  upsertWorkflow: (wf: Workflow) => void;
  upsertSchedule: (s: WorkflowSchedule) => void;
  removeSchedule: (id: string) => void;
  duplicateSchedule: (id: string) => WorkflowSchedule | undefined;
}

/** Keep history bounded: the 40 newest runs, and every run still going. */
function bounded(runs: Record<string, WorkflowRun>): Record<string, WorkflowRun> {
  const ids = Object.values(runs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((r, i) => i < 40 || isActive(r.status))
    .map((r) => r.id);
  return Object.fromEntries(ids.map((id) => [id, runs[id]]));
}

/** Runs kept whole in storage; older finished runs keep their counts, evidence and shortlist but not every job id they saw. */
const WHOLE_RUNS = 10;
const LIST_CAP = 50;
const EVENTS_KEPT = 30;

/**
 * What the run history saves: the newest runs as they are, older finished ones without the long lists of
 * every job id a stage handled (`jobIds`, `analyzedIds` — hundreds each) and with only their last events.
 * The history was the account's largest document (~0.5 MB) and was saved whole on every progress event.
 */
export function compactRuns(runs: Record<string, WorkflowRun>): Record<string, WorkflowRun> {
  const sorted = Object.values(runs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Object.fromEntries(
    sorted.map((r, i) => {
      if (i < WHOLE_RUNS || isActive(r.status)) return [r.id, r];
      const outputs = Object.fromEntries(
        Object.entries(r.outputs).map(([k, o]) => {
          if (!o?.data) return [k, o];
          const data = Object.fromEntries(Object.entries(o.data).map(([dk, v]) => [dk, Array.isArray(v) && v.length > LIST_CAP && dk !== "rankedJobIds" ? v.slice(0, LIST_CAP) : v]));
          return [k, { ...o, data }];
        }),
      ) as WorkflowRun["outputs"];
      return [r.id, { ...r, outputs, events: r.events.slice(-EVENTS_KEPT) }];
    }),
  );
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      runs: {},
      workflows: {},
      schedules: {},
      upsertRun: (run) => set((s) => ({ runs: bounded({ ...s.runs, [run.id]: run }) })),
      upsertRuns: (list) => set((s) => ({ runs: bounded({ ...s.runs, ...Object.fromEntries(list.map((r) => [r.id, r])) }) })),
      removeRun: (id) =>
        set((s) => {
          const runs = { ...s.runs };
          delete runs[id];
          return { runs };
        }),
      upsertWorkflow: (wf) => set((s) => ({ workflows: { ...s.workflows, [wf.id]: wf } })),
      upsertSchedule: (sch) => set((s) => ({ schedules: { ...s.schedules, [sch.id]: sch } })),
      removeSchedule: (id) =>
        set((s) => {
          const schedules = { ...s.schedules };
          delete schedules[id];
          return { schedules };
        }),
      duplicateSchedule: (id) => {
        const src = get().schedules[id];
        if (!src) return undefined;
        const copy: WorkflowSchedule = { ...structuredClone(src), id: newId("sch"), name: `${src.name} (copy)`, enabled: false, lastRunAt: undefined, lastRunId: undefined, createdAt: new Date().toISOString() };
        set((s) => ({ schedules: { ...s.schedules, [copy.id]: copy } }));
        return copy;
      },
    }),
    { name: "wj.workflow", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: (s) => ({ runs: compactRuns(s.runs), workflows: s.workflows, schedules: s.schedules }) },
  ),
);

export const selectActiveRun = (s: WorkflowState) => Object.values(s.runs).find((r) => isActive(r.status));
