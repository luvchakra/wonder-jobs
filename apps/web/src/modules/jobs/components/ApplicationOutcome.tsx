"use client";
import type { CanonicalJob } from "@/domain/jobs/types";
import { useApplicationsStore } from "@/store/applications";
import { MARKED_APPLIED, MARKED_WITHDRAWN } from "@/domain/applications/cardStatus";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { track } from "@/lib/analytics";
import { toast } from "@/components/feedback/Toast";
import { OutcomeButtons } from "@/wonderworks/listing/OutcomeButtons";

/** Apply opened on the employer's site (job page or card): remembered for the job's page, and the job enters Pipeline → Preparing. */
export function noteApplyOpened(jobId: string) {
  useJobsStore.getState().markApplyOpened(jobId);
  useApplicationsStore.getState().startPreparing(jobId, "Opened Apply on the employer's site");
}

/** Whether a job's page asks how the application went: once Apply was opened, a résumé was made for it, or it was already marked. */
export function useAsksOutcome(jobId: string): boolean {
  const opened = useJobsStore((s) => !!s.applyOpenedAt[jobId]);
  const resume = useCareerStore((s) => s.savedResumes.some((r) => r.target?.jobId === jobId));
  const marked = useApplicationsStore((s) => Object.values(s.applications).some((a) => a.jobId === jobId && (a.status === "submitted" || a.status === "withdrawn")));
  return opened || resume || marked;
}

/**
 * The candidate's own record of how this job's application went (owner, 2026-10-25): Mark as applied puts it in
 * Pipeline as Submitted, Mark as withdrawn as Withdrawn — their word, recorded on the application's timeline as theirs.
 * Nothing is sent anywhere. Shown once Apply was opened on the employer's site or a résumé was made for the job, on
 * WonderWorks' OutcomeButtons.
 */
export function ApplicationOutcome({ job }: { job: CanonicalJob }) {
  const app = useApplicationsStore((s) => Object.values(s.applications).find((a) => a.jobId === job.id));
  const mark = (outcome: "applied" | "withdrawn") => {
    const store = useApplicationsStore.getState();
    const a = app ?? store.create(job.id, "saved");
    if (outcome === "applied") store.setStatus(a.id, "submitted", { type: "submitted", title: MARKED_APPLIED, detail: `Applied to ${job.company} yourself` });
    else store.setStatus(a.id, "withdrawn", { type: "outcome", title: MARKED_WITHDRAWN, detail: `Not applying to ${job.company}` });
    track("application_marked", { jobId: job.id, outcome });
    toast.success(outcome === "applied" ? "Marked as applied" : "Marked as withdrawn", "It's in Pipeline.");
  };
  return <OutcomeButtons outcome={app?.status === "submitted" ? "applied" : app?.status === "withdrawn" ? "withdrawn" : null} onMark={mark} />;
}
