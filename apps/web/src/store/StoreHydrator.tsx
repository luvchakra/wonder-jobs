"use client";
import { useEffect } from "react";
import { useHydration } from "./hydration";
import { useCareerStore } from "./career";
import { useJobsStore } from "./jobs";
import { useApplicationsStore } from "./applications";
import { useAutomationStore } from "./automation";
import { useAIStore } from "./ai";
import { useWorkflowStore } from "./workflow";
import { useUIStore } from "./ui";
import { useActionsStore } from "./actions";
import { getWorkflowService } from "@/services/workflow/service";
import { SchedulerRunner } from "@/components/automation/SchedulerRunner";

let booting = false;

/** Rehydrates persisted stores on the client, then boots the workflow service. */
export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrated = useHydration((s) => s.hydrated);
  const setHydrated = useHydration((s) => s.setHydrated);
  useEffect(() => {
    if (hydrated || booting) return;
    booting = true;
    (async () => {
      await Promise.all([
        useCareerStore.persist.rehydrate(),
        useJobsStore.persist.rehydrate(),
        useApplicationsStore.persist.rehydrate(),
        useAutomationStore.persist.rehydrate(),
        useAIStore.persist.rehydrate(),
        useWorkflowStore.persist.rehydrate(),
        useUIStore.persist.rehydrate(),
        useActionsStore.persist.rehydrate(),
      ]);
      useJobsStore.getState().loadInitial();
      getWorkflowService().hydrate();
      void useAIStore.getState().refreshKeys();
      setHydrated();
    })();
  }, [hydrated, setHydrated]);
  return (
    <>
      {hydrated && <SchedulerRunner />}
      {children}
    </>
  );
}
