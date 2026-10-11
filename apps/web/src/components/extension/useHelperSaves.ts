"use client";
import { useEffect } from "react";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import { getClientMode } from "@/lib/mode";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";

type Doc<T> = { state?: { state?: T } };

async function serverCopy<T>(store: string): Promise<T | undefined> {
  const res = await fetch(`/api/state/${store}`, { cache: "no-store" });
  if (!res.ok || res.status === 204) return undefined;
  return ((await res.json()) as Doc<T>).state?.state;
}

/**
 * The browser helper saved a job from another tab (docs/EXTENSION_BEYOND_AUTOFILL.md). It wrote it to this
 * account on the server; this open tab takes the job and its application from that server copy — the event
 * carries only ids — so the tab's own next sync doesn't write over them.
 */
export function useHelperSaves() {
  useEffect(() => {
    if (getClientMode().mode !== "user") return;
    const onSaved = (e: Event) => {
      const { jobId, applicationId } = ((e as CustomEvent).detail ?? {}) as { jobId?: unknown; applicationId?: unknown };
      if (typeof jobId !== "string" || typeof applicationId !== "string") return;
      void Promise.all([
        serverCopy<{ jobs?: Record<string, CanonicalJob>; matches?: Record<string, JobMatch> }>("wj.jobs"),
        serverCopy<{ applications?: Record<string, Application> }>("wj.applications"),
      ])
        .then(([jobs, apps]) => {
          const job = jobs?.jobs?.[jobId];
          const app = apps?.applications?.[applicationId];
          if (!job || !app || app.jobId !== jobId) return;
          const store = useJobsStore.getState();
          store.restoreJobs([job]);
          if (jobs?.matches?.[jobId]) store.setMatches([jobs.matches[jobId]]);
          store.save(jobId);
          useApplicationsStore.getState().adopt(app);
        })
        .catch(() => undefined);
    };
    window.addEventListener("wonderjobs:job-saved", onSaved);
    return () => window.removeEventListener("wonderjobs:job-saved", onSaved);
  }, []);
}
