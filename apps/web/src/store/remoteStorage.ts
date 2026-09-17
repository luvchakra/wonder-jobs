"use client";
import type { StateStorage } from "zustand/middleware";

/**
 * Zustand storage that persists each store as a per-tenant document on the
 * server (Supabase when configured) with localStorage as cache and fallback.
 *
 * - getItem: server first; on 404/offline, the local copy (which is then
 *   uploaded on the next write — that migrates existing local data).
 * - setItem: local immediately; server debounced per store, flushed on
 *   pagehide/visibility change with keepalive so the last write lands.
 */
const DEBOUNCE_MS = 900;
const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
const memoryFallback = new Map<string, string>();
let listenersBound = false;

function local() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* blocked */
  }
  return null;
}
function readLocal(name: string) {
  const ls = local();
  if (ls) {
    try {
      return ls.getItem(name);
    } catch {
      /* ignore */
    }
  }
  return memoryFallback.get(name) ?? null;
}
function writeLocal(name: string, value: string) {
  const ls = local();
  if (ls) {
    try {
      ls.setItem(name, value);
      return;
    } catch {
      /* quota / blocked */
    }
  }
  memoryFallback.set(name, value);
}

export type SyncState = "idle" | "syncing" | "synced" | "local";
const listeners = new Set<(s: SyncState) => void>();
let current: SyncState = "idle";
function setSync(s: SyncState) {
  current = s;
  listeners.forEach((l) => l(s));
}
export const syncStatus = {
  get: () => current,
  subscribe: (l: (s: SyncState) => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

async function push(name: string, value: string, keepalive = false) {
  try {
    setSync("syncing");
    const res = await fetch(`/api/state/${encodeURIComponent(name)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: JSON.parse(value) }), keepalive });
    setSync(res.ok ? "synced" : "local");
  } catch {
    setSync("local");
  }
}

export function flushRemote(keepalive = true) {
  for (const [name, p] of pending) {
    clearTimeout(p.timer);
    pending.delete(name);
    void push(name, p.value, keepalive);
  }
}

function bindFlushListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("pagehide", () => flushRemote(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushRemote(true);
  });
}

export const remoteStorage: StateStorage = {
  async getItem(name) {
    bindFlushListeners();
    const localValue = readLocal(name);
    if (typeof fetch === "undefined") return localValue;
    try {
      const res = await fetch(`/api/state/${encodeURIComponent(name)}`, { cache: "no-store" });
      if (res.status === 204 || res.status === 404) {
        // Nothing on this backend yet: use the local copy and migrate it up.
        if (localValue) void push(name, localValue);
        return localValue;
      }
      if (res.ok) {
        const doc = (await res.json()) as { state: unknown };
        const value = JSON.stringify(doc.state);
        writeLocal(name, value);
        setSync("synced");
        return value;
      }
      return localValue;
    } catch {
      setSync("local");
      return localValue;
    }
  },
  setItem(name, value) {
    writeLocal(name, value);
    bindFlushListeners();
    const existing = pending.get(name);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pending.delete(name);
      void push(name, value);
    }, DEBOUNCE_MS);
    pending.set(name, { value, timer });
  },
  removeItem(name) {
    const ls = local();
    try {
      ls?.removeItem(name);
    } catch {
      /* ignore */
    }
    memoryFallback.delete(name);
    if (typeof fetch !== "undefined") void fetch(`/api/state/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(() => {});
  },
};

/** Test hook: pending writes by store name. */
export function pendingWrites() {
  return [...pending.keys()];
}
