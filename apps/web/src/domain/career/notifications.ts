import type { Notification } from "./types";

/** The one thing each kind of notification lets the candidate do, as the label on its button. */
export const NOTIFICATION_ACTION: Record<Notification["category"], string> = {
  strong_opportunity: "See matches",
  workflow_completed: "View search",
  workflow_requires_input: "Review",
  follow_up_due: "Follow up",
  interview_upcoming: "Prepare",
  provider_issue: "Check AI settings",
  scheduled_run_failed: "See what happened",
  application_status: "Open application",
};

const sameMessage = (a: Pick<Notification, "category" | "title" | "body">, b: Pick<Notification, "category" | "title" | "body">) => a.category === b.category && a.title === b.title && a.body === b.body;

/**
 * Add a notification. An unread one saying exactly the same thing is replaced, not stacked — the
 * newest keeps its link (e.g. the latest run). Read ones stay as history.
 */
export function addNotification(list: Notification[], n: Omit<Notification, "id" | "at" | "read">, id: string, at: string, cap: number): Notification[] {
  return [{ ...n, id, at, read: false }, ...list.filter((x) => x.read || !sameMessage(x, n))].slice(0, cap);
}

/** What the panel shows: newest first, one per distinct message (older copies already stored before deduping existed are folded in). */
export function visibleNotifications(list: Notification[]): Notification[] {
  const seen: Notification[] = [];
  for (const n of [...list].sort((a, b) => b.at.localeCompare(a.at))) if (!seen.some((x) => sameMessage(x, n))) seen.push(n);
  return seen;
}
