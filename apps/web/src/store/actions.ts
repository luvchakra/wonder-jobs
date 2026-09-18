"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { ActionType } from "@/domain/workflow/types";
import { newId } from "@/lib/ids";

/**
 * Ledger for external side effects started outside a workflow run (spec §11):
 * confirmation, idempotency, execution history, clear success/failure, retry.
 */
export interface ExternalAction {
  id: string;
  type: ActionType;
  applicationId: string;
  idempotencyKey: string;
  label: string;
  /** Draft content the user reviewed (e.g. the email body). Never sent to analytics. */
  content: string;
  status: "draft" | "confirmed" | "executing" | "succeeded" | "failed";
  attempts: number;
  createdAt: string;
  executedAt?: string;
  error?: string;
  history: { at: string; event: string; detail?: string }[];
}

interface ActionsState {
  actions: Record<string, ExternalAction>;
  create: (input: Omit<ExternalAction, "id" | "status" | "attempts" | "createdAt" | "history">) => ExternalAction;
  update: (id: string, patch: Partial<ExternalAction>, event?: { event: string; detail?: string }) => void;
  byKey: (key: string) => ExternalAction | undefined;
}

export const useActionsStore = create<ActionsState>()(
  persist(
    (set, get) => ({
      actions: {},
      create: (input) => {
        const at = new Date().toISOString();
        const a: ExternalAction = { ...input, id: newId("xact"), status: "draft", attempts: 0, createdAt: at, history: [{ at, event: "drafted" }] };
        set((s) => ({ actions: { ...s.actions, [a.id]: a } }));
        return a;
      },
      update: (id, patch, event) =>
        set((s) => {
          const a = s.actions[id];
          if (!a) return s;
          const history = event ? [...a.history, { at: new Date().toISOString(), ...event }] : a.history;
          return { actions: { ...s.actions, [id]: { ...a, ...patch, history } } };
        }),
      byKey: (key) => Object.values(get().actions).find((a) => a.idempotencyKey === key && a.status === "succeeded"),
    }),
    { name: "wj.actions", storage: createRemoteStorage(), skipHydration: true, version: 1 },
  ),
);
