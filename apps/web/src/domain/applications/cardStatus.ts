/**
 * What a job card says about the job's application (owner, 2026-10-25): its Pipeline stage by name — Applied for a
 * submitted application (Pipeline's own word, whether marked on the job's page or sent with Wonder), Withdrawn for
 * one marked as withdrawn, and so on.
 */
import { APPLICATION_STATUS_META, type Application, type ApplicationStatus } from "./types";

/** The timeline titles the job page's Mark as applied / Mark as withdrawn record. */
export const MARKED_APPLIED = "Marked as applied by you";
export const MARKED_WITHDRAWN = "Marked as withdrawn by you";

export function cardStatus(app: Pick<Application, "status">): { label: string; tone: (typeof APPLICATION_STATUS_META)[ApplicationStatus]["tone"] } {
  if (app.status === "submitted") return { label: "Applied", tone: "success" };
  const meta = APPLICATION_STATUS_META[app.status];
  return { label: meta.label, tone: meta.tone };
}

/**
 * The statuses a candidate sets by hand, as Pipeline groups them (owner, 2026-10-25): Preparing, Applied, Interview,
 * and the three outcomes. The finer ones Wonder tracks itself (Saved, Ready for Review, Under Review, Unknown) show
 * as the stage they belong to.
 */
export const STATUS_CHOICES: { value: ApplicationStatus; label: string }[] = [
  { value: "preparing", label: "Preparing" },
  { value: "submitted", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function statusChoiceOf(status: ApplicationStatus): ApplicationStatus {
  if (status === "saved" || status === "ready_for_review") return "preparing";
  if (status === "under_review" || status === "unknown") return "submitted";
  return status;
}
