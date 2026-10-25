"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";

interface UIState {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  /** The account menu: closed, or open from the top bar's avatar or the phone's floating menu button. */
  menu: null | "top" | "fab";
  setMenu: (v: null | "top" | "fab") => void;
  /** Screens with their own bar at the bottom (Application Pack, Refine) showing now: the floating menu button steps aside. */
  bottomBars: number;
  addBottomBar: (d: 1 | -1) => void;
  /** Bumped when the candidate changes their profile photo, so every avatar reloads it. */
  photoVersion: number;
  bumpPhoto: () => void;
  /** Find's Refine panel — opened from its own button or from "Refine search options" when nothing shows. */
  refineOpen: boolean;
  setRefineOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  /** The Pipeline stage last opened (Preparing, Applied, Interview, Outcome) — the one tab kept between visits (owner, 2026-10-25). */
  pipelineStage?: PipelineStage;
  setPipelineStage: (g: PipelineStage) => void;
}

export type PipelineStage = "in_progress" | "submitted" | "interview" | "outcome";
const STAGES: PipelineStage[] = ["in_progress", "submitted", "interview", "outcome"];

/** Cross-cutting UI state: whether the Ask Wonder field and the account menu are open — momentary, never persisted —
 *  and the one kept preference, Pipeline's last-opened stage. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
      menu: null,
      setMenu: (v) => set({ menu: v }),
      bottomBars: 0,
      addBottomBar: (d) => set((s) => ({ bottomBars: Math.max(0, s.bottomBars + d) })),
      photoVersion: 0,
      bumpPhoto: () => set((s) => ({ photoVersion: s.photoVersion + 1 })),
      refineOpen: false,
      setRefineOpen: (v) => set((s) => ({ refineOpen: typeof v === "function" ? v(s.refineOpen) : v })),
      pipelineStage: undefined,
      setPipelineStage: (g) => set({ pipelineStage: g }),
    }),
    { name: "wj.ui", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: (s) => (s.pipelineStage ? { pipelineStage: s.pipelineStage } : {}),
      // Only a known stage comes back.
      merge: (p, current) => {
        const g = (p as { pipelineStage?: unknown } | undefined)?.pipelineStage;
        return { ...current, ...(STAGES.includes(g as PipelineStage) ? { pipelineStage: g as PipelineStage } : {}) };
      },
    },
  ),
);
