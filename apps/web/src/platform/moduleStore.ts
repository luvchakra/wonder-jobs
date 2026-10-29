"use client";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ModuleId } from "@/modules/registry";

/** Caps, like store/jobs.ts: what a reload needs, never an uncapped list. */
export const MODULE_SAVED_CAP = 300;
export const MODULE_RESPONSES_CAP = 300;
export const MODULE_RECENT_CAP = 10;

/** One response the person made in a module (an application, a booking request, an RSVP…), by listing id. */
export interface ModuleResponseRef {
  stage: string;
  at: string;
}

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
  /** Save or unsave; `item` is the listing as the card showed it. */
  toggleSaved: (listingId: string, item?: unknown) => void;
  setResponse: (listingId: string, stage: string) => void;
  /** Into Find's history, or Saved's. */
  rememberSearch: (q: string, where?: "find" | "saved") => void;
  forgetSearch: (q: string, where?: "find" | "saved") => void;
  setPersona: (p: Record<string, unknown>) => void;
}

const newestFirst = <T>(rec: Record<string, T>, at: (v: T) => string, cap: number) => Object.fromEntries(Object.entries(rec).sort(([, a], [, b]) => at(b).localeCompare(at(a))).slice(0, cap));

/** What persists: trimmed to the caps, and listing snapshots only for what's still saved or responded to. Exported for tests. */
export function compactModuleState(s: Pick<ModuleState, "saved" | "responses" | "recentSearches"> & Partial<Pick<ModuleState, "items" | "persona" | "recentSavedSearches">>) {
  const saved = newestFirst(s.saved, (v) => v, MODULE_SAVED_CAP);
  const responses = newestFirst(s.responses, (v) => v.at, MODULE_RESPONSES_CAP);
  const items = Object.fromEntries(Object.entries(s.items ?? {}).filter(([id]) => id in saved || id in responses));
  return { saved, responses, recentSearches: s.recentSearches.slice(0, MODULE_RECENT_CAP), recentSavedSearches: (s.recentSavedSearches ?? []).slice(0, MODULE_RECENT_CAP), items, persona: s.persona ?? null };
}

function make(id: ModuleId) {
  return create<ModuleState>()(
    persist<ModuleState, [], [], ReturnType<typeof compactModuleState>>(
      (set) => ({
        saved: {},
        responses: {},
        recentSearches: [],
        recentSavedSearches: [],
        items: {},
        persona: null,
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
          const t = q.trim();
          const key = where === "saved" ? "recentSavedSearches" : "recentSearches";
          if (t) set((s) => ({ [key]: [t, ...s[key].filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MODULE_RECENT_CAP) }));
        },
        forgetSearch: (q, where = "find") => {
          const key = where === "saved" ? "recentSavedSearches" : "recentSearches";
          set((s) => ({ [key]: s[key].filter((x) => x !== q) }));
        },
      }),
      // One document per module, so no module ever reads another's saves or responses. Jobs keeps its own stores.
      { name: `wj.m.${id}`, version: 1, storage: createJSONStorage(() => localStorage), partialize: (s: ModuleState) => compactModuleState(s) },
    ),
  );
}

const stores = new Map<ModuleId, UseBoundStore<StoreApi<ModuleState>>>();

/** The module-scoped store for a module (one per module, created on first use). Jobs uses store/jobs.ts instead. */
export function moduleStore(id: Exclude<ModuleId, "jobs">) {
  let s = stores.get(id);
  if (!s) stores.set(id, (s = make(id)));
  return s;
}
