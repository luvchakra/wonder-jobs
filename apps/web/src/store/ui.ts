"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";

interface UIState {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
}

/** Cross-cutting UI state: the global command field, sidebar collapse (persisted) and the mobile nav
 *  drawer (deliberately not persisted — it's a momentary overlay, not a device preference, so every
 *  fresh load starts with it closed regardless of how a previous session left it). */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      mobileNavOpen: false,
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
    }),
    { name: "wj.ui", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
