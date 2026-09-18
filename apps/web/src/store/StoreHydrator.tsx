"use client";
import { useEffect, useLayoutEffect } from "react";
import { markHydrated, useHydration } from "./hydration";
import { useCareerStore } from "./career";
import { useJobsStore } from "./jobs";
import { useApplicationsStore } from "./applications";
import { useAutomationStore } from "./automation";
import { useAIStore } from "./ai";
import { useWorkflowStore } from "./workflow";
import { useUIStore } from "./ui";
import { useActionsStore } from "./actions";
import { onRemoteChange } from "./remoteStorage";
import { getWorkflowService } from "@/services/workflow/service";
import { SchedulerRunner } from "@/components/automation/SchedulerRunner";

const STORES = {
  "wj.career": useCareerStore,
  "wj.jobs": useJobsStore,
  "wj.applications": useApplicationsStore,
  "wj.automation": useAutomationStore,
  "wj.ai": useAIStore,
  "wj.workflow": useWorkflowStore,
  "wj.ui": useUIStore,
  "wj.actions": useActionsStore,
} as const;

let booting = false;

/** Non-critical boot work runs after the first paint. */
function afterPaint(fn: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 0);
}

function finishBoot() {
  // The catalog is needed by the first screen and is cheap (~40 ms); compute before paint so nothing flashes.
  if (typeof performance !== "undefined") performance.mark("wj:boot");
  useJobsStore.getState().loadInitial();
  markHydrated();
  afterPaint(() => {
    getWorkflowService().hydrate();
    void useAIStore.getState().refreshKeys();
  });
}

/**
 * Rehydrate every persisted store. With a local copy present this completes
 * synchronously (see remoteStorage), so calling it from a layout effect lets
 * the hydrated tree replace the SSR skeleton before the browser paints.
 */
export function bootStores() {
  if (booting) return;
  booting = true;
  const stores = Object.values(STORES);
  const results = stores.map((s) => s.persist.rehydrate());
  if (stores.every((s) => s.persist.hasHydrated())) finishBoot();
  else void Promise.all(results).then(finishBoot, finishBoot);
}

/** Rehydrates persisted stores on the client, then boots the workflow service. */
export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrated = useHydration((s) => s.hydrated);
  useLayoutEffect(() => {
    if (!hydrated) bootStores();
  }, [hydrated]);
  // Stale-while-revalidate: when the server has a newer copy of a store, re-read it in place.
  useEffect(
    () =>
      onRemoteChange((name) => {
        const store = STORES[name as keyof typeof STORES];
        if (store) void store.persist.rehydrate();
      }),
    [],
  );
  return (
    <>
      {hydrated && <SchedulerRunner />}
      {children}
    </>
  );
}
