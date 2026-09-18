"use client";
import { useSyncExternalStore } from "react";

/**
 * Tracks client-side rehydration of persisted stores so SSR markup never
 * depends on localStorage. Implemented as a tiny external store: the flag
 * flips synchronously inside a layout effect, so the first client render
 * after hydration already shows real data — no skeleton frame.
 */
let hydrated = false;
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function markHydrated() {
  if (hydrated) return;
  hydrated = true;
  if (typeof performance !== "undefined" && "mark" in performance) performance.mark("wj:hydrated");
  listeners.forEach((l) => l());
}

export function isHydrated() {
  return hydrated;
}

type HydrationState = { hydrated: boolean };
const HYDRATED: HydrationState = { hydrated: true };
const NOT_HYDRATED: HydrationState = { hydrated: false };

export function useHydration<T>(selector: (s: HydrationState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(hydrated ? HYDRATED : NOT_HYDRATED),
    () => selector(NOT_HYDRATED),
  );
}
