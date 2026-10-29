"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { useApplicationsStore } from "@/store/applications";
import { MARKED_APPLIED, MARKED_WITHDRAWN } from "@/domain/applications/cardStatus";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { track } from "@/lib/analytics";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

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
 * Nothing is sent anywhere. Shown once Apply was opened on the employer's site or a résumé was made for the job.
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
  const done = app?.status === "submitted";
  const dropped = app?.status === "withdrawn";
  const btn = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border px-2 text-[12.5px] font-medium wj-press";
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="How did this application go?">
      <button type="button" aria-pressed={done} onClick={() => !done && mark("applied")} className={cn(btn, done ? "border-success-600 bg-success-100 text-success-600" : "border-line bg-surface text-ink hover:bg-surface-2")}>
        <CheckCircle2 className="size-4" aria-hidden /> {done ? "Applied" : "Mark as applied"}
      </button>
      <button type="button" aria-pressed={dropped} onClick={() => !dropped && mark("withdrawn")} className={cn(btn, dropped ? "border-line-strong bg-bg-soft text-ink-2" : "border-line bg-surface text-ink hover:bg-surface-2")}>
        <XCircle className="size-4" aria-hidden /> {dropped ? "Withdrawn" : "Mark as withdrawn"}
      </button>
    </div>
  );
}
