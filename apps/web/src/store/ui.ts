"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";

interface UIState {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
}

/** Cross-cutting UI state: whether the Ask Wonder field is open. It's a momentary overlay, not a device
 *  preference, so nothing is persisted — the store keeps its persist wrapper only so StoreHydrator can
 *  treat every store the same way. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
    }),
    { name: "wj.ui", storage: createRemoteStorage(), skipHydration: true, version: 1, partialize: () => ({}) },
  ),
);
