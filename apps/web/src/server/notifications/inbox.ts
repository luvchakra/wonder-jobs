/**
 * The bell's list lives in the candidate's career document, which both the browser and the server write:
 * the browser when the candidate acts, the server when the daily job raises a reminder or a company sends a
 * message. A tab left open overnight would otherwise save its stale copy over what the server added, so every
 * save of that document keeps the server's notifications and raised reminders (domain/career/notifications.ts).
 */
import { mergeNotifications, mergeReminded } from "@/domain/career/notifications";
import type { Notification } from "@/domain/career/types";
import { stateStore } from "@/server/state";

type CareerDoc = { state?: { notifications?: Notification[]; reminded?: string[] } & Record<string, unknown>; version?: number };

/** A career document about to be saved, with what's already stored folded in (unchanged when there's nothing to fold). */
export async function keepServerInbox(tenantId: string, incoming: unknown): Promise<unknown> {
  const next = incoming as CareerDoc | null;
  if (!next || typeof next !== "object" || !next.state || typeof next.state !== "object") return incoming;
  const stored = (await stateStore.get(tenantId, "wj.career").catch(() => undefined))?.state as CareerDoc | undefined;
  const had = stored?.state;
  if (!had) return incoming;
  return {
    ...next,
    state: {
      ...next.state,
      notifications: mergeNotifications(next.state.notifications, had.notifications),
      reminded: mergeReminded(had.reminded, next.state.reminded),
    },
  };
}

/** What the browser re-reads when the candidate comes back to the tab: the bell and the raised reminders. */
export async function readInbox(tenantId: string): Promise<{ notifications: Notification[]; reminded: string[] }> {
  const doc = (await stateStore.get(tenantId, "wj.career"))?.state as CareerDoc | undefined;
  return { notifications: doc?.state?.notifications ?? [], reminded: doc?.state?.reminded ?? [] };
}
