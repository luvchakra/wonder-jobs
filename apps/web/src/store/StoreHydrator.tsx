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
import { useAuthStore } from "./auth";
import { onRemoteChange } from "./remoteStorage";
import { getWorkflowService } from "@/services/workflow/service";
import { isDemoSeeded, seedDemo } from "@/services/mock/demo";
import { getClientMode } from "@/lib/mode";
import { getSupabaseBrowser } from "@/lib/auth/browser";
import { WonderJobsAIProvider } from "@/services/ai/service";
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

/** Signed-in users: fill in the name from the account the first time, before onboarding asks for anything. */
async function bootstrapIdentity() {
  const sb = getSupabaseBrowser();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  useAuthStore.getState().set({ email: user.email ?? null, userId: user.id });
  const career = useCareerStore.getState();
  if (!career.dna.name) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : (user.email?.split("@")[0] ?? "");
    if (name) career.updateDNA({ name });
  }
}

function finishBoot() {
  const mode = getClientMode();
  useAuthStore.getState().set({ mode: mode.mode, userId: mode.mode === "user" ? mode.userId : null });
  // Demo / local development: the sample candidate, applied once per device.
  if (mode.mode !== "user" && !isDemoSeeded()) seedDemo();
  // The catalog is needed by the first screen and is cheap (~40 ms); compute before paint so nothing flashes.
  if (typeof performance !== "undefined") performance.mark("wj:boot");
  useJobsStore.getState().loadInitial();
  markHydrated();
  afterPaint(() => {
    getWorkflowService().hydrate();
    void useAIStore.getState().refreshKeys();
    WonderJobsAIProvider.setRemote(mode.mode === "user" ? null : false);
    if (mode.mode === "user") {
      void bootstrapIdentity();
      void fetch("/api/jobs/sources", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { available?: Record<string, boolean> } | null) => d?.available && useJobsStore.getState().setSourceAvailability(d.available))
        .catch(() => {});
    }
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
  // Matches follow the candidate: any Career DNA change re-scores the catalog.
  useEffect(
    () =>
      useCareerStore.subscribe((s, prev) => {
        if (s.dna !== prev.dna) useJobsStore.getState().rescore();
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
