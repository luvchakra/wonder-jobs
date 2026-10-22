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
  materials_ready: "Review draft",
  job_closed: "See saved jobs",
  recruiter_message: "Open message",
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

export const NOTIFICATION_CAP = 50;
export const REMINDED_CAP = 200;

/**
 * Two copies of the bell's list made into one: the browser's (what it has shown and marked read) and the
 * server's (what the daily job or a recruiter's message added while the browser wasn't looking). Every
 * notification from either is kept, once; read if either copy says so; newest first, up to the cap.
 */
export function mergeNotifications(a: readonly Notification[] = [], b: readonly Notification[] = [], cap = NOTIFICATION_CAP): Notification[] {
  const byId = new Map<string, Notification>();
  for (const n of [...a, ...b]) {
    if (!n || typeof n.id !== "string") continue;
    const had = byId.get(n.id);
    byId.set(n.id, had ? { ...had, ...n, read: had.read || n.read } : n);
  }
  return [...byId.values()].sort((x, y) => y.at.localeCompare(x.at)).slice(0, cap);
}

/** Reminders already raised, from either copy: once raised, never again (newest kept when capped). */
export function mergeReminded(a: readonly string[] = [], b: readonly string[] = [], cap = REMINDED_CAP): string[] {
  return [...new Set([...a, ...b].filter((x) => typeof x === "string"))].slice(-cap);
}
