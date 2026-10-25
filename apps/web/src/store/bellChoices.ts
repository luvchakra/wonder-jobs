/**
 * Which kinds of notification this person keeps in their bell (Notifications & email → In the bell), for notices
 * raised in this tab. Read once a page load for signed-in accounts; until then, and when signed out, all are kept.
 */
import { topicOf, type NotifyPrefs } from "@/domain/notifications/prefs";
import type { Notification } from "@/domain/career/types";

let prefs: NotifyPrefs | null = null;

export function setBellChoices(next: NotifyPrefs | null) {
  prefs = next;
}

export const keepsInBell = (category: Notification["category"]) => !prefs || prefs[topicOf(category)].bell;
