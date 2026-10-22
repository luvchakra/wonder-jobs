import { DEFAULT_NOTIFY_PREFS, NOTIFY_TOPICS, hasChannel, type NotifyPrefs, type NotifyTopic, type NudgeChannel } from "./prefs";

/**
 * The platform's notification settings (owner, 2026-10-22): WonderJobs Admin → Settings → Notifications.
 * They bound what every person can be sent and set what a new person starts with:
 * - a switch per channel for everyone (push, email) — off means nothing goes that way, whatever people chose;
 * - per kind of notification, which of those channels people may use at all, and the default they start with;
 * - how often a conversation may email, and how early reminders are raised.
 * A person's own choices (prefs.ts) apply only inside these. The bell is theirs alone: the platform never turns it off.
 */
export interface NotifyTopicPolicy {
  /** People may turn this channel on for the topic. */
  allowed: Record<NudgeChannel, boolean>;
  /** What someone who never chose starts with. */
  defaults: Record<NudgeChannel, boolean>;
}

export interface NotifyAdmin {
  channels: Record<NudgeChannel, boolean>;
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
  topics: Object.fromEntries(NOTIFY_TOPICS.map((t) => [t.id, { allowed: { push: hasChannel(t.id, "push"), email: hasChannel(t.id, "email") }, defaults: { push: DEFAULT_NOTIFY_PREFS[t.id].push, email: DEFAULT_NOTIFY_PREFS[t.id].email } }])) as Record<NotifyTopic, NotifyTopicPolicy>,
  messageEmailEveryMin: 30,
  interviewLeadHours: 48,
  followUpLeadHours: 24,
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d: number, [lo, hi]: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/**
 * Stored or received: known fields only, booleans as booleans, numbers kept in range, a channel a kind can't use off;
 * the rest is the default. Settings saved before reminders were split carry over to both kinds of reminder.
 */
export function cleanNotifyAdmin(raw: unknown): NotifyAdmin {
  const r = obj(raw);
  const ch = obj(r.channels);
  const topics = obj(r.topics);
  const D = DEFAULT_NOTIFY_ADMIN;
  return {
    channels: { push: bool(ch.push, D.channels.push), email: bool(ch.email, D.channels.email) },
    topics: Object.fromEntries(
      NOTIFY_TOPICS.map(({ id }) => {
        const t = obj(topics[id] ?? (id === "interviews" || id === "follow_ups" ? topics.reminders : undefined));
        const a = obj(t.allowed);
        const d = obj(t.defaults);
        const ch = (c: NudgeChannel, v: unknown, dflt: boolean) => hasChannel(id, c) && bool(v, dflt);
        return [id, { allowed: { push: ch("push", a.push, D.topics[id].allowed.push), email: ch("email", a.email, D.topics[id].allowed.email) }, defaults: { push: ch("push", d.push, D.topics[id].defaults.push), email: ch("email", d.email, D.topics[id].defaults.email) } }];
      }),
    ) as Record<NotifyTopic, NotifyTopicPolicy>,
    messageEmailEveryMin: num(r.messageEmailEveryMin, D.messageEmailEveryMin, NOTIFY_ADMIN_LIMITS.messageEmailEveryMin),
    interviewLeadHours: num(r.interviewLeadHours, D.interviewLeadHours, NOTIFY_ADMIN_LIMITS.interviewLeadHours),
    followUpLeadHours: num(r.followUpLeadHours, D.followUpLeadHours, NOTIFY_ADMIN_LIMITS.followUpLeadHours),
    ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
    ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}),
  };
}

/** Whether people may use a channel for a kind at all: the kind can go that way, the channel is on for everyone, and allowed for the kind. */
export const channelAllowed = (admin: NotifyAdmin, topic: NotifyTopic, channel: NudgeChannel) => hasChannel(topic, channel) && admin.channels[channel] && admin.topics[topic].allowed[channel];

/** Every kind × push/email allowance, for the person's own settings screen. */
export function allowedChannels(admin: NotifyAdmin): Record<NotifyTopic, Record<NudgeChannel, boolean>> {
  return Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { push: channelAllowed(admin, id, "push"), email: channelAllowed(admin, id, "email") }])) as Record<NotifyTopic, Record<NudgeChannel, boolean>>;
}

/** The platform's defaults as the starting point for someone's choices; everything starts in the bell. */
export const adminDefaults = (admin: NotifyAdmin): NotifyPrefs => Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { bell: true, ...admin.topics[id].defaults }])) as NotifyPrefs;

/** What actually goes: the person's choice, only where the platform allows it (the bell is theirs alone). */
export function effectivePrefs(prefs: NotifyPrefs, admin: NotifyAdmin): NotifyPrefs {
  return Object.fromEntries(NOTIFY_TOPICS.map(({ id }) => [id, { bell: prefs[id].bell, push: prefs[id].push && channelAllowed(admin, id, "push"), email: prefs[id].email && channelAllowed(admin, id, "email") }])) as NotifyPrefs;
}

/** Reminder lead times in milliseconds, by follow-up kind. */
export const reminderLeads = (admin: Pick<NotifyAdmin, "interviewLeadHours" | "followUpLeadHours">) => ({
  interview: admin.interviewLeadHours * 3_600_000,
  follow_up: admin.followUpLeadHours * 3_600_000,
  thank_you: admin.followUpLeadHours * 3_600_000,
});
