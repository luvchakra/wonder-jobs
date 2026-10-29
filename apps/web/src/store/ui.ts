"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import { isLive, moduleById, type ModuleId } from "@/modules/registry";

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
  /** The WonderWorks module the four tabs belong to now (picked in Find's menu; Jobs until another is). Kept per account. */
  activeModule?: ModuleId;
  setActiveModule: (m: ModuleId) => void;
}

export type PipelineStage = "in_progress" | "submitted" | "interview" | "outcome";
const STAGES: PipelineStage[] = ["in_progress", "submitted", "interview", "outcome"];

/** A module id that names a live module, or undefined. */
export function liveModule(v: unknown): ModuleId | undefined {
  const m = typeof v === "string" ? moduleById(v) : undefined;
  return m && isLive(m) ? m.id : undefined;
}

/** The cookie the server's /app reads to open on the active module's Find (app/app/page.tsx). */
export const MODULE_COOKIE = "wj_module";
function rememberModule(m: ModuleId) {
  try {
    document.cookie = m === "jobs" ? `${MODULE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` : `${MODULE_COOKIE}=${m}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* no document: nothing to remember */
  }
}

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
      activeModule: undefined,
      setActiveModule: (m) => {
        set({ activeModule: m });
        rememberModule(m);
      },
    }),
    { name: "wj.ui", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: (s) => ({ ...(s.pipelineStage ? { pipelineStage: s.pipelineStage } : {}), ...(s.activeModule && s.activeModule !== "jobs" ? { activeModule: s.activeModule } : {}) }),
      // Only a known stage, and a module that's live, comes back.
      merge: (p, current) => {
        const g = (p as { pipelineStage?: unknown } | undefined)?.pipelineStage;
        const m = liveModule((p as { activeModule?: unknown } | undefined)?.activeModule);
        if (m) rememberModule(m);
        return { ...current, ...(STAGES.includes(g as PipelineStage) ? { pipelineStage: g as PipelineStage } : {}), ...(m ? { activeModule: m } : {}) };
      },
    },
  ),
);
