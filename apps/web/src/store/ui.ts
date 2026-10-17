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
}

/** Cross-cutting UI state: whether the Ask Wonder field and the account menu are open. It's a momentary overlay, not a device
 *  preference, so nothing is persisted — the store keeps its persist wrapper only so StoreHydrator can
 *  treat every store the same way. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
      menu: null,
      setMenu: (v) => set({ menu: v }),
      bottomBars: 0,
      addBottomBar: (d) => set((s) => ({ bottomBars: Math.max(0, s.bottomBars + d) })),
    }),
    { name: "wj.ui", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: () => ({}) },
  ),
);
