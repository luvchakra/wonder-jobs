"use client";
import { create } from "zustand";

/** Tracks client-side rehydration of persisted stores so SSR markup never depends on localStorage. */
export const useHydration = create<{ hydrated: boolean; setHydrated: () => void }>((set) => ({
  hydrated: false,
  setHydrated: () => set({ hydrated: true }),
}));
