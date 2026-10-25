/**
 * A reminder the candidate set on one calendar event — an interview, a follow-up or a thank-you note (owner,
 * 2026-10-25): how long before, and which ways — in the app (the bell), push, email. Every way they pick is used
 * (unlike the default reminders, where email only goes when no push reached them). With no reminder set, the
 * platform's lead time and their Notifications & email choices apply as before; no ways picked means no reminder.
 * The server checks every hour, so a reminder arrives within the hour before its time.
 */
export type ReminderChannel = "app" | "push" | "email";

export interface EventReminder {
  /** Minutes before the event. */
  before: number;
  channels: ReminderChannel[];
}

export const REMINDER_LEADS = [
  { before: 60, label: "1 hour before" },
  { before: 180, label: "3 hours before" },
  { before: 1440, label: "1 day before" },
  { before: 2880, label: "2 days before" },
] as const;

export const REMINDER_CHANNELS: { id: ReminderChannel; label: string }[] = [
  { id: "app", label: "In app" },
  { id: "push", label: "Push" },
  { id: "email", label: "Email" },
];

/** A new event's reminder: a day before, in the app and by push. */
export const DEFAULT_REMINDER: EventReminder = { before: 1440, channels: ["app", "push"] };

const LEADS = new Set<number>(REMINDER_LEADS.map((l) => l.before));
const CHANNELS = new Set<string>(REMINDER_CHANNELS.map((c) => c.id));

/** Stored or received: a known lead and known ways only (in a fixed order), else none. */
export function cleanReminder(raw: unknown): EventReminder | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.before !== "number" || !LEADS.has(r.before) || !Array.isArray(r.channels)) return undefined;
  const picked = new Set(r.channels.filter((c): c is ReminderChannel => typeof c === "string" && CHANNELS.has(c)));
  return { before: r.before, channels: REMINDER_CHANNELS.map((c) => c.id).filter((c) => picked.has(c)) };
}

/** How long before the event a reminder goes: the candidate's own choice when set (null: none), else the default lead. */
export function reminderLeadMs(remind: unknown, defaultLeadMs: number): number | null {
  if (remind === undefined) return defaultLeadMs;
  const r = cleanReminder(remind);
  return r && r.channels.length ? r.before * 60_000 : null;
}

/** "1 day before · In app, Push" — or "No reminder". */
export function describeReminder(remind: EventReminder | undefined): string {
  const r = cleanReminder(remind);
  if (!r || !r.channels.length) return "No reminder";
  const lead = REMINDER_LEADS.find((l) => l.before === r.before)!.label;
  return `${lead} · ${r.channels.map((c) => REMINDER_CHANNELS.find((x) => x.id === c)!.label).join(", ")}`;
}
