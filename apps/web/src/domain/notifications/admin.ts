import { DEFAULT_NOTIFY_PREFS, NOTIFY_TOPICS, type NotifyChannel, type NotifyPrefs, type NotifyTopic } from "./prefs";

/**
 * The platform's notification settings (owner, 2026-10-22): WonderJobs Admin → Settings → Notifications.
 * They bound what every person can be sent and set what a new person starts with:
 * - a switch per channel for everyone (push, email) — off means nothing goes that way, whatever people chose;
 * - per topic, which channels people may use at all, and the default they start with;
 * - how often a conversation may email, and how early reminders are raised.
 * A person's own choices (prefs.ts) apply only inside these. The bell is never switched off: it's the record.
 */
export interface NotifyTopicPolicy {
  /** People may turn this channel on for the topic. */
  allowed: Record<NotifyChannel, boolean>;
  /** What someone who never chose starts with. */
  defaults: Record<NotifyChannel, boolean>;
}

export interface NotifyAdmin {
  channels: Record<NotifyChannel, boolean>;
  topics: Record<NotifyTopic, NotifyTopicPolicy>;
  /** At most one email per conversation this often (minutes). */
  messageEmailEveryMin: number;
  /** How early an interview reminder is raised (hours before). */
  interviewLeadHours: number;
  /** How early a follow-up or thank-you reminder is raised (hours before). */
  followUpLeadHours: number;
  updatedAt?: string;
  updatedBy?: string;
}

// Reminder leads stay within the 2 days the due-reminder lookup scans (migration 0006, `due_reminder_tenants`).
export const NOTIFY_ADMIN_LIMITS = {
  messageEmailEveryMin: [5, 1440],
  interviewLeadHours: [2, 48],
  followUpLeadHours: [1, 48],
} as const;

export const DEFAULT_NOTIFY_ADMIN: NotifyAdmin = {
  channels: { push: true, email: true },
  topics: Object.fromEntries(NOTIFY_TOPICS.map((t) => [t.id, { allowed: { push: true, email: true }, defaults: { ...DEFAULT_NOTIFY_PREFS[t.id] } }])) as Record<NotifyTopic, NotifyTopicPolicy>,
  messageEmailEveryMin: 30,
  interviewLeadHours: 48,
  followUpLeadHours: 24,
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d: number, [lo, hi]: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** Stored or received: known fields only, booleans as booleans, numbers kept in range; the rest is the default. */
export function cleanNotifyAdmin(raw: unknown): NotifyAdmin {
  const r = obj(raw);
  const ch = obj(r.channels);
  const topics = obj(r.topics);
  const D = DEFAULT_NOTIFY_ADMIN;
  return {
    channels: { push: bool(ch.push, D.channels.push), email: bool(ch.email, D.channels.email) },
    topics: Object.fromEntries(
      NOTIFY_TOPICS.map(({ id }) => {
        const t = obj(topics[id]);
        const a = obj(t.allowed);
        const d = obj(t.defaults);
        return [id, { allowed: { push: bool(a.push, D.topics[id].allowed.push), email: bool(a.email, D.topics[id].allowed.email) }, defaults: { push: bool(d.push, D.topics[id].defaults.push), email: bool(d.email, D.topics[id].defaults.email) } }];
      }),
    ) as Record<NotifyTopic, NotifyTopicPolicy>,
    messageEmailEveryMin: num(r.messageEmailEveryMin, D.messageEmailEveryMin, NOTIFY_ADMIN_LIMITS.messageEmailEveryMin),
    interviewLeadHours: num(r.interviewLeadHours, D.interviewLeadHours, NOTIFY_ADMIN_LIMITS.interviewLeadHours),
    followUpLeadHours: num(r.followUpLeadHours, D.followUpLeadHours, NOTIFY_ADMIN_LIMITS.followUpLeadHours),
    ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}),
  };
}

/** Whether people may use a channel for a topic at all: the channel is on for everyone, and allowed for the topic. */
export const channelAllowed = (admin: NotifyAdmin, topic: NotifyTopic, channel: NotifyChannel) => admin.channels[channel] && admin.topics[topic].allowed[channel];

/** Every topic × channel's allowance, for the person's own settings screen. */
export function allowedChannels(admin: NotifyAdmin): Record<NotifyTopic, Record<NotifyChannel, boolean>> {
  return Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { push: channelAllowed(admin, id, "push"), email: channelAllowed(admin, id, "email") }])) as Record<NotifyTopic, Record<NotifyChannel, boolean>>;
}

/** The platform's defaults as the starting point for someone's choices. */
export const adminDefaults = (admin: NotifyAdmin): NotifyPrefs => Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { ...admin.topics[id].defaults }])) as NotifyPrefs;

/** What actually goes: the person's choice, only where the platform allows it. */
export function effectivePrefs(prefs: NotifyPrefs, admin: NotifyAdmin): NotifyPrefs {
  return Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { push: prefs[id].push && channelAllowed(admin, id, "push"), email: prefs[id].email && channelAllowed(admin, id, "email") }])) as NotifyPrefs;
}

/** Reminder lead times in milliseconds, by follow-up kind. */
export const reminderLeads = (admin: Pick<NotifyAdmin, "interviewLeadHours" | "followUpLeadHours">) => ({
  interview: admin.interviewLeadHours * 3_600_000,
  follow_up: admin.followUpLeadHours * 3_600_000,
  thank_you: admin.followUpLeadHours * 3_600_000,
});
