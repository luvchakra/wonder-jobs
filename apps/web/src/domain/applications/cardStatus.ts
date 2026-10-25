/**
 * What a job card says about the job's application (owner, 2026-10-25): the candidate's own mark — Completed or
 * Abandoned — when they marked it on the job's page, otherwise the Pipeline stage's name.
 */
import { APPLICATION_STATUS_META, type Application } from "./types";

/** The timeline titles the job page's Mark as completed / Mark as abandoned record. */
export const MARKED_COMPLETED = "Marked as completed by you";
export const MARKED_ABANDONED = "Marked as abandoned by you";

export function cardStatus(app: Pick<Application, "status" | "events">): { label: string; tone: (typeof APPLICATION_STATUS_META)[keyof typeof APPLICATION_STATUS_META]["tone"] } {
  const marked = (title: string) => app.events.some((e) => e.title === title);
  if (app.status === "submitted" && marked(MARKED_COMPLETED)) return { label: "Completed", tone: "success" };
  if (app.status === "withdrawn" && marked(MARKED_ABANDONED)) return { label: "Abandoned", tone: "neutral" };
  const meta = APPLICATION_STATUS_META[app.status];
  return { label: meta.label, tone: meta.tone };
}
