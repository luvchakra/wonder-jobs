"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function mediaStore(query: string) {
  let mq: MediaQueryList | null = null;
  const get = () => {
    if (typeof window === "undefined") return null;
    if (!mq) mq = window.matchMedia(query);
    return mq;
  };
  return {
    subscribe: (cb: () => void) => {
      const m = get();
      if (!m) return () => {};
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    snapshot: () => get()?.matches ?? false,
  };
}

const reducedMotion = mediaStore("(prefers-reduced-motion: reduce)");
const coarsePointer = mediaStore("(pointer: coarse)");

/** True when the OS asks for reduced motion. Always false during SSR. */
export function useReducedMotion() {
  return useSyncExternalStore(reducedMotion.subscribe, reducedMotion.snapshot, () => false);
}

/** True on touch/low-power-ish devices where expensive scroll effects should be reduced. */
export function useLowPowerHint() {
  const coarse = useSyncExternalStore(coarsePointer.subscribe, coarsePointer.snapshot, () => false);
  const weak = useSyncExternalStore(
    noopSubscribe,
    () => {
      const nav = navigator as Navigator & { hardwareConcurrency?: number; deviceMemory?: number };
      return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    },
    () => false,
  );
  return coarse || weak;
}

/** Wall clock with minute granularity — stable during render, ticks via subscription. */
const MINUTE = 60_000;
const nowStore = {
  subscribe: (cb: () => void) => {
    const id = setInterval(cb, MINUTE);
    return () => clearInterval(id);
  },
  snapshot: () => Math.floor(Date.now() / MINUTE) * MINUTE,
};
export function useNow() {
  return useSyncExternalStore(nowStore.subscribe, nowStore.snapshot, nowStore.snapshot);
}

/** Animates a number towards `value`; respects reduced motion by snapping. */
export function useAnimatedNumber(value: number, durationMs = 600) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reduced || durationMs <= 0) return;
    const from = current.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (to - from) * eased);
      current.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, durationMs]);
  return reduced || durationMs <= 0 ? value : display;
}

/** Generic media-query subscription; false during SSR. */
const mediaStores = new Map<string, ReturnType<typeof mediaStore>>();
export function useMediaQuery(query: string) {
  let store = mediaStores.get(query);
  if (!store) {
    store = mediaStore(query);
    mediaStores.set(query, store);
  }
  return useSyncExternalStore(store.subscribe, store.snapshot, () => false);
}
