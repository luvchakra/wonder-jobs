/**
 * What a job card says about the job's application (owner, 2026-10-25): Completed when the candidate marked it so on
 * the job's page, otherwise the Pipeline stage's name (a job marked as withdrawn reads Withdrawn, the stage's own name).
 */
import { APPLICATION_STATUS_META, type Application } from "./types";

/** The timeline titles the job page's Mark as completed / Mark as withdrawn record. */
export const MARKED_COMPLETED = "Marked as completed by you";
export const MARKED_WITHDRAWN = "Marked as withdrawn by you";

export function cardStatus(app: Pick<Application, "status" | "events">): { label: string; tone: (typeof APPLICATION_STATUS_META)[keyof typeof APPLICATION_STATUS_META]["tone"] } {
  const marked = (title: string) => app.events.some((e) => e.title === title);
  if (app.status === "submitted" && marked(MARKED_COMPLETED)) return { label: "Completed", tone: "success" };
  const meta = APPLICATION_STATUS_META[app.status];
  return { label: meta.label, tone: meta.tone };
}
