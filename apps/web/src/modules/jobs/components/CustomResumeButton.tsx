"use client";
import type { CanonicalJob } from "@/domain/jobs/types";
import { useApplicationsStore } from "@/store/applications";
import { ResumeButton } from "@/wonderworks/listing/ResumeButton";

/** Jobs' Generate Customized Resume: WonderWorks' ResumeButton for the job; making one puts the job in Pipeline → Preparing. */
export function CustomResumeButton({ job, primary = false }: { job: CanonicalJob; primary?: boolean }) {
  return <ResumeButton target={job} primary={primary} onMade={() => useApplicationsStore.getState().startPreparing(job.id, "Customized résumé made")} />;
}
