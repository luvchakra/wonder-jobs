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
  removeRun: (id: string) => void;
  upsertWorkflow: (wf: Workflow) => void;
  upsertSchedule: (s: WorkflowSchedule) => void;
  removeSchedule: (id: string) => void;
  duplicateSchedule: (id: string) => WorkflowSchedule | undefined;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      runs: {},
      workflows: {},
      schedules: {},
      upsertRun: (run) =>
        set((s) => {
          const runs = { ...s.runs, [run.id]: run };
          // keep history bounded; never drop active runs
          const ids = Object.values(runs)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .filter((r, i) => i < 40 || isActive(r.status))
            .map((r) => r.id);
          return { runs: Object.fromEntries(ids.map((id) => [id, runs[id]])) };
        }),
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
    { name: "wj.workflow", storage: createRemoteStorage(), skipHydration: true, version: 1 },
  ),
);

export const selectActiveRun = (s: WorkflowState) => Object.values(s.runs).find((r) => isActive(r.status));
