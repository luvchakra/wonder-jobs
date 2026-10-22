import type { Notification } from "@/domain/career/types";

/**
 * What a person is told, and how (owner, 2026-10-22): Notifications & email (/app/settings/notifications) lists every
 * kind of notification WonderJobs sends, each with the channels it can actually use:
 * - In the bell: the in-app list (on, it's kept; off, that kind isn't added).
 * - Push: to every browser where they turned notifications on.
 * - Email: to their sign-in address, only when a push didn't reach them — so both on never means two of the same.
 * A kind raised only inside the app (an application update, a saved job closing) has the bell and nothing else.
 */
export type NotifyChannel = "bell" | "push" | "email";
/** The channels that reach someone outside the app; the platform's settings (admin.ts) bound these. */
export type NudgeChannel = "push" | "email";

const ALL = ["bell", "push", "email"] as const;
export const NOTIFY_TOPICS = [
  { id: "messages", label: "Messages from companies", hint: "A company writes to you, or a candidate replies", channels: ALL },
  { id: "interviews", label: "Interview reminders", hint: "Before an interview on one of your applications", channels: ALL },
  { id: "follow_ups", label: "Follow-up reminders", hint: "When a follow-up or thank-you is due", channels: ALL },
  { id: "matches", label: "Strong matches", hint: "Roles that fit you; push and email for scheduled searches", channels: ALL },
  { id: "searches", label: "Search results and problems", hint: "How a search went, or that it needs you; push and email for scheduled searches", channels: ALL },
  { id: "applications", label: "Application updates", hint: "A status change, or an AI draft ready to review", channels: ["bell"] },
  { id: "saved_jobs", label: "Saved jobs closing", hint: "A job you saved is no longer open", channels: ["bell"] },
] as const satisfies readonly { id: string; label: string; hint: string; channels: readonly NotifyChannel[] }[];

export type NotifyTopic = (typeof NOTIFY_TOPICS)[number]["id"];
export type NotifyPrefs = Record<NotifyTopic, Record<NotifyChannel, boolean>>;

const TOPIC = Object.fromEntries(NOTIFY_TOPICS.map((t) => [t.id, t])) as Record<NotifyTopic, (typeof NOTIFY_TOPICS)[number]>;
/** Whether a kind of notification can go this way at all. */
export const hasChannel = (topic: NotifyTopic, channel: NotifyChannel) => (TOPIC[topic].channels as readonly NotifyChannel[]).includes(channel);

/** Everything in the bell; messages and reminders also by push and email; matches and searches by push (the daily activity email covers them). */
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  messages: { bell: true, push: true, email: true },
  interviews: { bell: true, push: true, email: true },
  follow_ups: { bell: true, push: true, email: true },
  matches: { bell: true, push: true, email: false },
  searches: { bell: true, push: true, email: false },
  applications: { bell: true, push: false, email: false },
  saved_jobs: { bell: true, push: false, email: false },
};

/**
 * Stored or received: known kinds and channels only, as booleans; anything missing is its default; a channel a kind
 * can't use is off. Choices saved before reminders were split (one "reminders" choice) carry over to both.
 */
export function cleanNotifyPrefs(raw: unknown, defaults: NotifyPrefs = DEFAULT_NOTIFY_PREFS): NotifyPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : undefined);
  const out = {} as NotifyPrefs;
  for (const { id } of NOTIFY_TOPICS) {
    const t = obj(r[id]) ?? (id === "interviews" || id === "follow_ups" ? obj(r.reminders) : undefined) ?? {};
    const pick = (c: NotifyChannel) => hasChannel(id, c) && (typeof t[c] === "boolean" ? (t[c] as boolean) : defaults[id][c]);
    out[id] = { bell: pick("bell"), push: pick("push"), email: pick("email") };
  }
  return out;
}

/** The kind each notification belongs to. */
export function topicOf(category: Notification["category"]): NotifyTopic {
  switch (category) {
    case "recruiter_message":
      return "messages";
    case "interview_upcoming":
      return "interviews";
    case "follow_up_due":
      return "follow_ups";
    case "strong_opportunity":
      return "matches";
    case "application_status":
    case "materials_ready":
      return "applications";
    case "job_closed":
      return "saved_jobs";
    case "workflow_completed":
    case "workflow_requires_input":
    case "scheduled_run_failed":
    case "provider_issue":
      return "searches";
  }
}
