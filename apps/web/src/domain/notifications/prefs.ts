import type { Notification } from "@/domain/career/types";

/**
 * What a person is told outside the app, and how (owner, 2026-10-22): Account → Notifications & email →
 * Notify me about. The bell always keeps every notification — it's the record; these choose the nudges.
 * Email goes only when a push didn't reach them (no browser with notifications on), so turning both on
 * never means two of the same.
 */
export const NOTIFY_TOPICS = [
  { id: "messages", label: "Messages from companies", hint: "A company writes to you, or a candidate replies" },
  { id: "reminders", label: "Interview and follow-up reminders", hint: "The day or two before" },
  { id: "matches", label: "Strong matches from scheduled searches", hint: "When a scheduled search finds one" },
] as const;

export type NotifyTopic = (typeof NOTIFY_TOPICS)[number]["id"];
export type NotifyChannel = "push" | "email";
export type NotifyPrefs = Record<NotifyTopic, Record<NotifyChannel, boolean>>;

/** Messages and reminders reach you somehow by default; strong matches are pushed, and the daily activity email covers them. */
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  messages: { push: true, email: true },
  reminders: { push: true, email: true },
  matches: { push: true, email: false },
};

/** Stored or received: known topics and channels only, as booleans; anything missing is its default. */
export function cleanNotifyPrefs(raw: unknown): NotifyPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as NotifyPrefs;
  for (const { id } of NOTIFY_TOPICS) {
    const t = (r[id] && typeof r[id] === "object" ? r[id] : {}) as Record<string, unknown>;
    out[id] = { push: typeof t.push === "boolean" ? t.push : DEFAULT_NOTIFY_PREFS[id].push, email: typeof t.email === "boolean" ? t.email : DEFAULT_NOTIFY_PREFS[id].email };
  }
  return out;
}

/** The topic a notification belongs to; none for what's only in the bell (it's never pushed or emailed). */
export function topicOf(category: Notification["category"]): NotifyTopic | null {
  switch (category) {
    case "recruiter_message":
      return "messages";
    case "interview_upcoming":
    case "follow_up_due":
      return "reminders";
    case "strong_opportunity":
      return "matches";
    default:
      return null;
  }
}
