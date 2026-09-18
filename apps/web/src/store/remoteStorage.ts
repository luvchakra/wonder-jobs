"use client";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { getClientMode, storageKeyFor, syncsToServer } from "@/lib/mode";

/**
 * Zustand storage that persists each store as a per-tenant document on the
 * server (Supabase when configured) with localStorage as cache and fallback.
 *
 * Built for instant page loads (spec §40):
 * - Local-first reads. When a local copy exists, `getItem` returns it
 *   synchronously so every store hydrates in the same tick — no network on
 *   the critical path. The server is then consulted once, in the background,
 *   in a single batched request; stores whose server copy is newer are
 *   re-hydrated in place (stale-while-revalidate).
 * - First visit on a device (no local copy): one batched GET for all stores.
 * - Writes: serialization is debounced off the interaction, no-op writes are
 *   dropped, and all dirty stores go to the server in one batched PUT.
 *   Unsynced stores are remembered so they survive reloads and win over the
 *   server copy on the next revalidation.
 */
const SERIALIZE_MS = 120;
const PUSH_MS = 900;
const DIRTY_KEY = "wj.sync.dirty";

type Doc = { state: unknown; version: number; updatedAt: string };

const memoryFallback = new Map<string, string>();
/** Latest in-memory value per store (object form), pending serialization. */
const latest = new Map<string, StorageValue<unknown>>();
/** Last serialized value per store — used to drop no-op writes. */
const serialized = new Map<string, string>();
/** Server copies fetched this page load (already applied locally). */
const serverDocs = new Map<string, string>();
let serializeTimer: ReturnType<typeof setTimeout> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSerialize = new Set<string>();
let pendingPush = new Set<string>();
let listenersBound = false;
let loadAllPromise: Promise<Record<string, Doc> | null> | null = null;
let revalidated = false;
/** Store names that hydrated through this adapter this page load. */
const known = new Set<string>();

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

/** Local keys are namespaced per signed-in user (or the demo) so a shared device never mixes accounts. */
function localKey(name: string) {
  return storageKeyFor(name, getClientMode());
}

function readDirty(): Set<string> {
  try {
    const raw = readLocal(localKey(DIRTY_KEY));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeDirty(set: Set<string>) {
  writeLocal(localKey(DIRTY_KEY), JSON.stringify([...set]));
}
function markDirty(names: Iterable<string>) {
  const d = readDirty();
  for (const n of names) d.add(n);
  writeDirty(d);
}
function clearDirty(names: Iterable<string>) {
  const d = readDirty();
  for (const n of names) d.delete(n);
  writeDirty(d);
}

export type SyncState = "idle" | "syncing" | "synced" | "local";
const listeners = new Set<(s: SyncState) => void>();
let current: SyncState = "idle";
function setSync(s: SyncState) {
  if (s === current) return;
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

/** Stores whose server copy changed after hydration; the hydrator re-reads them. */
const remoteChangeListeners = new Set<(name: string) => void>();
export function onRemoteChange(l: (name: string) => void) {
  remoteChangeListeners.add(l);
  return () => {
    remoteChangeListeners.delete(l);
  };
}

function parse(value: string | null): StorageValue<unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as StorageValue<unknown>;
  } catch {
    return null;
  }
}

/** One GET for every store document of this tenant. Shared by all callers of a page load. */
function loadAll(): Promise<Record<string, Doc> | null> {
  if (loadAllPromise) return loadAllPromise;
  loadAllPromise = (async () => {
    if (typeof fetch === "undefined" || !syncsToServer()) return null;
    try {
      // The app layout starts this request before any JS is parsed (see app/app/layout.tsx).
      const w = typeof window === "undefined" ? undefined : (window as unknown as { __wjState?: Promise<Response | undefined> });
      const early = w?.__wjState;
      if (w) w.__wjState = undefined;
      const res = (await early) ?? (await fetch("/api/state", { cache: "no-store" }));
      if (!res.ok) {
        setSync("local");
        return null;
      }
      const body = (await res.json()) as { docs: Record<string, Doc> };
      setSync("synced");
      return body.docs ?? {};
    } catch {
      setSync("local");
      return null;
    }
  })();
  return loadAllPromise;
}

/**
 * Background reconciliation, once per page load: dirty stores are pushed,
 * stores with a newer server copy are re-hydrated, and local-only stores
 * are migrated up. Never blocks rendering.
 */
async function revalidate() {
  if (revalidated) return;
  revalidated = true;
  const docs = await loadAll();
  if (!docs) return;
  const dirty = readDirty();
  const toPush = new Set<string>();
  // Unsynced local edits (e.g. written while offline) win and go up first.
  for (const name of dirty) if (readLocal(localKey(name)) !== null) toPush.add(name);
  for (const [name, doc] of Object.entries(docs)) {
    if (dirty.has(name)) continue; // local edits win; they go up below
    const value = JSON.stringify(doc.state);
    serverDocs.set(name, value);
    if (readLocal(localKey(name)) !== value) {
      writeLocal(localKey(name), value);
      serialized.set(name, value);
      latest.delete(name);
      remoteChangeListeners.forEach((l) => l(name));
    }
  }
  // Local copies the server has never seen (first sync after an offline period / migration).
  for (const name of known) {
    if (!(name in docs) && !toPush.has(name) && readLocal(localKey(name)) !== null) toPush.add(name);
  }
  if (toPush.size) {
    for (const n of toPush) pendingPush.add(n);
    schedulePush();
  }
}

function serializePending() {
  if (serializeTimer) clearTimeout(serializeTimer);
  serializeTimer = null;
  const names = pendingSerialize;
  pendingSerialize = new Set();
  const changed: string[] = [];
  for (const name of names) {
    const v = latest.get(name);
    if (!v) continue;
    const s = JSON.stringify(v);
    if (serialized.get(name) === s) continue; // no-op write
    serialized.set(name, s);
    writeLocal(localKey(name), s);
    changed.push(name);
  }
  if (changed.length && !syncsToServer()) return; // demo: device only
  if (changed.length) {
    markDirty(changed);
    for (const n of changed) pendingPush.add(n);
    schedulePush();
  }
}

function scheduleSerialize(name: string) {
  pendingSerialize.add(name);
  if (!serializeTimer) serializeTimer = setTimeout(serializePending, SERIALIZE_MS);
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow(false);
  }, PUSH_MS);
}

async function pushNow(keepalive: boolean) {
  const names = [...pendingPush];
  pendingPush = new Set();
  if (!names.length || typeof fetch === "undefined" || !syncsToServer()) return;
  const docs: Record<string, unknown> = {};
  for (const n of names) {
    const s = serialized.get(n) ?? readLocal(localKey(n));
    const v = parse(s);
    if (v) docs[n] = v;
  }
  if (!Object.keys(docs).length) return;
  try {
    setSync("syncing");
    const res = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs }), keepalive });
    if (res.ok) {
      clearDirty(Object.keys(docs));
      setSync("synced");
    } else {
      setSync("local");
    }
  } catch {
    setSync("local");
  }
}

/** Flush everything pending to the server now (used on pagehide with keepalive). */
export function flushRemote(keepalive = true) {
  serializePending();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  void pushNow(keepalive);
}

function bindFlushListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("pagehide", () => flushRemote(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushRemote(true);
  });
}

/** Storage adapter for one persisted store (object-level; serialization is deferred). */
export function createRemoteStorage<S>(): PersistStorage<S> {
  return {
    getItem(name) {
      bindFlushListeners();
      known.add(name);
      const fromServer = serverDocs.get(name);
      if (fromServer !== undefined) return parse(fromServer) as StorageValue<S> | null;
      const localValue = readLocal(localKey(name));
      if (localValue !== null) {
        serialized.set(name, localValue);
        void revalidate();
        return parse(localValue) as StorageValue<S> | null;
      }
      if (!syncsToServer()) return null;
      // Nothing local yet: this device has never seen the tenant. One batched request.
      return loadAll().then((docs) => {
        revalidated = true;
        const doc = docs?.[name];
        if (!doc) return null;
        const value = JSON.stringify(doc.state);
        serverDocs.set(name, value);
        writeLocal(localKey(name), value);
        serialized.set(name, value);
        return parse(value) as StorageValue<S> | null;
      });
    },
    setItem(name, value) {
      bindFlushListeners();
      latest.set(name, value as StorageValue<unknown>);
      scheduleSerialize(name);
    },
    removeItem(name) {
      const ls = local();
      try {
        ls?.removeItem(localKey(name));
      } catch {
        /* ignore */
      }
      memoryFallback.delete(name);
      latest.delete(name);
      serialized.delete(name);
      serverDocs.delete(name);
      clearDirty([name]);
      if (typeof fetch !== "undefined" && syncsToServer()) void fetch(`/api/state/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(() => {});
    },
  };
}

/** Test hook: stores with unsent changes (serialized or not). */
export function pendingWrites() {
  return [...new Set([...pendingSerialize, ...pendingPush])];
}

/** Test hook: reset module state between tests. */
export function __resetRemoteStorage() {
  latest.clear();
  serialized.clear();
  serverDocs.clear();
  memoryFallback.clear();
  pendingSerialize = new Set();
  pendingPush = new Set();
  if (serializeTimer) clearTimeout(serializeTimer);
  if (pushTimer) clearTimeout(pushTimer);
  serializeTimer = null;
  pushTimer = null;
  loadAllPromise = null;
  revalidated = false;
  known.clear();
  current = "idle";
}
