"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UIState {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

/** Cross-cutting UI state: the global command field and sidebar collapse (persisted). */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    { name: "wj.ui", storage: createJSONStorage(() => localStorage), skipHydration: true, version: 1, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
