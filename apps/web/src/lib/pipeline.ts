"use client";
import type { CanonicalJob } from "@/domain/jobs/types";
import { getClientMode } from "@/lib/mode";
import { track } from "@/lib/analytics";
import { useActionsStore } from "@/store/actions";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";

/**
 * Takes an application out of the Pipeline (owner, 2026-10-23): its drafts, follow-ups and reminders go with
 * it, and any email or submission still waiting to be sent is cancelled — never sent. What already happened
 * (an email sent, an application submitted) can't be undone and stays in its audit trail. The job goes back
 * into Find's results, marked "Removed from Pipeline".
 */
export async function removeFromPipeline(applicationId: string): Promise<void> {
  const app = useApplicationsStore.getState().applications[applicationId];
  if (!app) return;
  const actions = useActionsStore.getState();
  for (const a of Object.values(actions.actions)) {
    if (a.applicationId === applicationId && (a.status === "draft" || a.status === "confirmed")) actions.update(a.id, { status: "cancelled" }, { event: "Cancelled — the application was removed from the Pipeline" });
  }
  useApplicationsStore.getState().remove(applicationId);
  // The job itself: known in this browser, or found again on the server (signed in).
  let job: CanonicalJob | undefined = useJobsStore.getState().jobs[app.jobId];
  if (!job && getClientMode().mode === "user") {
    job = await fetch(`/api/jobs/lookup?ids=${encodeURIComponent(app.jobId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ jobs: CanonicalJob[] }>) : { jobs: [] }))
      .then((d) => d.jobs[0])
      .catch(() => undefined);
  }
  useJobsStore.getState().returnFromPipeline(app.jobId, job);
  track("application_removed", { applicationId, status: app.status });
}
