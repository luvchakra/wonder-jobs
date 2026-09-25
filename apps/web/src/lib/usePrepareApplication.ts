"use client";
import { useRouter } from "next/navigation";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { track } from "@/lib/analytics";

/**
 * Open a job's Application Pack: the existing application if there is one, otherwise a new "saved"
 * one (and the job saved). Nothing is generated or sent here — the Pack page does that on request.
 */
export function usePrepareApplication() {
  const router = useRouter();
  return (jobId: string) => {
    const apps = useApplicationsStore.getState();
    const jobs = useJobsStore.getState();
    const app = Object.values(apps.applications).find((a) => a.jobId === jobId) ?? apps.create(jobId, "saved");
    if (!jobs.saved[jobId]) jobs.save(jobId);
    track("application_pack_started", { jobId, existing: app.status !== "saved" });
    router.push(`/app/applications/${app.id}/prepare`);
  };
}
