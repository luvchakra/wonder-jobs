"use client";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import type { ModuleId } from "@/wonderworks/manifest";
import { createRemoteStorage, onRemoteChange } from "@/store/remoteStorage";
import { getClientMode, storageKeyFor } from "@/lib/mode";
import { lastEntries, memoOnInputs, recentEntries, remembered, shortened } from "./catalog";
import type { FindRun } from "./find/ModuleFind";

/** Caps, like store/jobs.ts: what a reload needs, never an uncapped list. */
export const MODULE_SAVED_CAP = 300;
export const MODULE_RESPONSES_CAP = 300;
export const MODULE_RECENT_CAP = 10;
/** How many of the last search's results a reload keeps (the rest come back with the next search). */
export const MODULE_CATALOG_CAP = 200;
/** A posting found closed stays out of the results this long, as on Jobs. */
export const CLOSED_DAYS = 7;
const CLOSED_CAP = 500;
/** How much of a listing's description storage keeps, as on Jobs. */
export const STORED_DESCRIPTION = 1500;

/** One response the person made in a module (an application, a booking request, an RSVP…), by listing id. */
export interface ModuleResponseRef {
  stage: string;
  at: string;
}

/** The last search as Find showed it: what was searched, where, each source's count, and the results in order. */
export type StoredRun = FindRun<{ id: string }> & { at: string };

export interface ModuleState {
  /** listingId → savedAt. */
  saved: Record<string, string>;
  /** listingId → where it stands in the module's Pipeline. */
  responses: Record<string, ModuleResponseRef>;
  /** What the person searched for, newest first. */
  recentSearches: string[];
  /** What they looked for among their saves (Saved's own box), newest first. */
  recentSavedSearches: string[];
  /** listingId → what Saved and Pipeline show of it (the module's own card fields), kept only while it's saved or responded to. */
  items: Record<string, unknown>;
  /** The person's profile for this module (its manifest's `persona`), as they confirmed it. Null until they do. */
  persona: Record<string, unknown> | null;
  /** The last search, so opening Find shows it again instead of searching. */
  lastRun: StoredRun | null;
  /** Listings found closed on their own site (id → when and why): out of the results for a week; a saved one stays. */
  closed: Record<string, { at: string; reason: string }>;
  /** When each listing's own link was last found open (id → ISO time), so it isn't re-checked every visit. */
  linkOpenAt: Record<string, string>;
  /** Save or unsave; `item` is the listing as the card showed it. */
  toggleSaved: (listingId: string, item?: unknown) => void;
  setResponse: (listingId: string, stage: string) => void;
  /** Into Find's history, or Saved's. */
  rememberSearch: (q: string, where?: "find" | "saved") => void;
  forgetSearch: (q: string, where?: "find" | "saved") => void;
  setPersona: (p: Record<string, unknown>) => void;
  /** Keep a finished search (closed listings left out). */
  setLastRun: (run: FindRun<{ id: string }>) => void;
  markClosed: (listingId: string, reason: string) => void;
  markLinkOpen: (listingIds: string[]) => void;
}

/** What a module may set when its store is first made. */
export interface ModuleStoreOptions {
  /** A listing as storage keeps it. By default a `description` longer than STORED_DESCRIPTION is shortened, as on Jobs. */
  trimItem?: (item: unknown) => unknown;
}

/** A listing kept short in storage: its description cut to STORED_DESCRIPTION, ending "…". Exported for tests. */
export function storedListing(item: unknown): unknown {
  const d = (item as { description?: unknown } | null)?.description;
  return typeof d === "string" && d.length > STORED_DESCRIPTION ? { ...(item as object), description: shortened(d, STORED_DESCRIPTION) } : item;
}

const newestFirst = <T>(rec: Record<string, T>, at: (v: T) => string, cap: number) => Object.fromEntries(Object.entries(rec).sort(([, a], [, b]) => at(b).localeCompare(at(a))).slice(0, cap));

const openOnly = (run: FindRun<{ id: string }>, closed: ModuleState["closed"], saved: ModuleState["saved"]) => {
  const recent = recentEntries(closed, (c) => c.at, CLOSED_DAYS, CLOSED_CAP);
  return run.results.filter((r) => !recent[r.id] || saved[r.id]);
};

/** The last run as storage keeps it: its first MODULE_CATALOG_CAP results, each trimmed. */
function storedRun(run: StoredRun | null | undefined, trim: (item: unknown) => unknown): StoredRun | null {
  if (!run) return null;
  return { ...run, results: run.results.slice(0, MODULE_CATALOG_CAP).map((r) => trim(r) as { id: string }) };
}

/** What persists: trimmed to the caps, and listing snapshots only for what's still saved or responded to. Exported for tests. */
export function compactModuleState(
  s: Pick<ModuleState, "saved" | "responses" | "recentSearches"> & Partial<Pick<ModuleState, "items" | "persona" | "recentSavedSearches" | "lastRun" | "closed" | "linkOpenAt">>,
  trim: (item: unknown) => unknown = storedListing,
) {
  const saved = newestFirst(s.saved, (v) => v, MODULE_SAVED_CAP);
  const responses = newestFirst(s.responses, (v) => v.at, MODULE_RESPONSES_CAP);
  const items = Object.fromEntries(Object.entries(s.items ?? {}).filter(([id]) => id in saved || id in responses));
  const lastRun = storedRun(s.lastRun, trim);
  const shown = new Set(lastRun?.results.map((r) => r.id));
  return {
    saved,
    responses,
    recentSearches: s.recentSearches.slice(0, MODULE_RECENT_CAP),
    recentSavedSearches: (s.recentSavedSearches ?? []).slice(0, MODULE_RECENT_CAP),
    items,
    persona: s.persona ?? null,
    lastRun,
    closed: recentEntries(s.closed, (c) => c.at, CLOSED_DAYS, CLOSED_CAP),
    linkOpenAt: lastEntries(s.linkOpenAt, CLOSED_CAP, (id) => shown.has(id) || id in saved),
  };
}

type Persisted = ReturnType<typeof compactModuleState>;

function make(id: Exclude<ModuleId, "jobs">, opts: ModuleStoreOptions) {
  const name = moduleStoreName(id);
  const trim = opts.trimItem ?? storedListing;
  // Persisting runs on every change; the run (up to MODULE_CATALOG_CAP listings) is copied only when it changed.
  const persisted = memoOnInputs(
    (saved: ModuleState["saved"], responses: ModuleState["responses"], recentSearches: string[], recentSavedSearches: string[], items: ModuleState["items"], persona: ModuleState["persona"], lastRun: ModuleState["lastRun"], closed: ModuleState["closed"], linkOpenAt: ModuleState["linkOpenAt"]) =>
      compactModuleState({ saved, responses, recentSearches, recentSavedSearches, items, persona, lastRun, closed, linkOpenAt }, trim),
  );
  const store = create<ModuleState>()(
    persist<ModuleState, [], [], Persisted>(
      (set) => ({
        saved: {},
        responses: {},
        recentSearches: [],
        recentSavedSearches: [],
        items: {},
        persona: null,
        lastRun: null,
        closed: {},
        linkOpenAt: {},
        toggleSaved: (listingId, item) =>
          set((s) => {
            const saved = { ...s.saved };
            const items = { ...s.items };
            if (saved[listingId]) delete saved[listingId];
            else {
              saved[listingId] = new Date().toISOString();
              if (item !== undefined) items[listingId] = item;
            }
            return { saved, items };
          }),
        setResponse: (listingId, stage) => set((s) => ({ responses: { ...s.responses, [listingId]: { stage, at: new Date().toISOString() } } })),
        setPersona: (persona) => set({ persona }),
        rememberSearch: (q, where = "find") => {
          const key = where === "saved" ? "recentSavedSearches" : "recentSearches";
          set((s) => {
            const next = remembered(s[key], q, MODULE_RECENT_CAP);
            return next === s[key] ? {} : { [key]: next };
          });
        },
        forgetSearch: (q, where = "find") => {
          const key = where === "saved" ? "recentSavedSearches" : "recentSearches";
          set((s) => ({ [key]: s[key].filter((x) => x !== q) }));
        },
        setLastRun: (run) => set((s) => ({ lastRun: { ...run, results: openOnly(run, s.closed, s.saved), at: new Date().toISOString() } })),
        markClosed: (listingId, reason) =>
          set((s) => {
            const closed = { ...s.closed, [listingId]: { at: new Date().toISOString(), reason } };
            // A saved listing stays, so nothing the person kept disappears.
            if (s.saved[listingId] || !s.lastRun) return { closed };
            return { closed, lastRun: { ...s.lastRun, results: s.lastRun.results.filter((r) => r.id !== listingId) } };
          }),
        markLinkOpen: (ids) => set((s) => ({ linkOpenAt: { ...s.linkOpenAt, ...Object.fromEntries(ids.map((x) => [x, new Date().toISOString()])) } })),
      }),
      // One document per module and tenant, so no module ever reads another's saves or responses; synced to the
      // account like Jobs' stores (remoteStorage.ts: local-first, throttled, batched). Jobs keeps its own stores.
      {
        name,
        version: 1,
        storage: createRemoteStorage<Persisted>(),
        skipHydration: true,
        partialize: (s) => persisted(s.saved, s.responses, s.recentSearches, s.recentSavedSearches, s.items, s.persona, s.lastRun, s.closed, s.linkOpenAt),
        merge: (p, current) => ({ ...current, ...(p as Partial<Persisted>) }),
      },
    ),
  );
  if (typeof window !== "undefined") {
    claimDeviceCopy(name);
    void store.persist.rehydrate();
    // Stale-while-revalidate: a newer server copy (another device) is read in place.
    onRemoteChange((changed) => {
      if (changed === name) void store.persist.rehydrate();
    });
  }
  return store;
}

/**
 * Before module stores synced, each kept one device copy under its bare name. A signed-in browser's copy now lives
 * under the account's key; the old one moves there once (only if the account has none here yet) and is removed.
 */
function claimDeviceCopy(name: string) {
  try {
    const key = storageKeyFor(name, getClientMode());
    if (key === name) return;
    const old = localStorage.getItem(name);
    if (old === null) return;
    if (localStorage.getItem(key) === null) localStorage.setItem(key, old);
    localStorage.removeItem(name);
  } catch {
    /* storage blocked */
  }
}

const stores = new Map<ModuleId, UseBoundStore<StoreApi<ModuleState>>>();

/** The module-scoped store for a module (one per module, made on first use with that call's options). Jobs uses store/jobs.ts instead. */
export function moduleStore(id: Exclude<ModuleId, "jobs">, opts: ModuleStoreOptions = {}) {
  let s = stores.get(id);
  if (!s) stores.set(id, (s = make(id, opts)));
  return s;
}

/** The persisted document name for a module's store (listed in server/state.ts STATE_STORES). */
export const moduleStoreName = (id: Exclude<ModuleId, "jobs">) => `wj.m.${id}` as const;
