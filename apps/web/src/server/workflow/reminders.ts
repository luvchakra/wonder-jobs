/**
 * Raising follow-up and interview reminders on the server.
 *
 * An interview on Tuesday morning is exactly the thing a candidate needs told to them on Monday, and
 * until now that only happened if they had a tab open at the right moment. This is the same decision the
 * browser's ticker makes (`services/scheduler.ts`), made by the cron against persisted state, and it is
 * idempotent through the same list the browser uses: once a follow-up's id is in `career.reminded`, no
 * one raises it again.
 */
import type { Application, ApplicationFollowUp } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { Notification } from "@/domain/career/types";
import { newId } from "@/lib/ids";
import { readClientState, writeClientState } from "@/server/clientState";
import { PERSIST_VERSION, type CareerDoc } from "./snapshot";
import { bellFilter } from "@/server/notifications/prefs";
import { cleanReminder, reminderLeadMs, type ReminderChannel } from "@/domain/calendar/reminder";

const DAY = 86_400_000;
/** How far ahead each kind is worth mentioning, and how long after it stays worth mentioning. */
const LEAD_TIME = { interview: 2 * DAY, follow_up: DAY, thank_you: DAY } as const;
const OVERDUE_GRACE = DAY;
const NOTIFICATION_CAP = 50;
const REMINDED_CAP = 200;

interface ApplicationsDoc {
  applications: Record<string, Application>;
}
interface JobsDoc {
  jobs: Record<string, CanonicalJob>;
}

export interface ReminderReport {
  tenantId: string;
  raised: number;
  /** What to nudge them with (each already in the bell), keyed once per reminder. */
  /** `channels`: the ways the candidate picked for this one (Calendar); unset, their usual choices apply. */
  notices: { notice: Pick<Notification, "category" | "title" | "body" | "href">; key: string; channels?: ReminderChannel[] }[];
}

export function isDueForReminder(followUp: Pick<ApplicationFollowUp, "dueAt" | "done" | "kind" | "remind">, now: number, leads: Record<ApplicationFollowUp["kind"], number> = LEAD_TIME): boolean {
  if (followUp.done) return false;
  // The candidate's own reminder (Calendar) wins over the default lead; one with no ways picked is no reminder.
  const lead = reminderLeadMs(followUp.remind, leads[followUp.kind]);
  const dueIn = new Date(followUp.dueAt).getTime() - now;
  if (lead === null || !Number.isFinite(dueIn)) return false;
  return dueIn <= lead && dueIn >= -OVERDUE_GRACE;
}

/**
 * Raises every reminder this tenant is due, writes them into the career document, and returns what to
 * push. Returns an empty report when there is nothing to say — silence is the common case and the
 * right one.
 */
export async function raiseDueReminders(tenantId: string, now: Date = new Date(), leads: Record<ApplicationFollowUp["kind"], number> = LEAD_TIME): Promise<ReminderReport> {
  const report: ReminderReport = { tenantId, raised: 0, notices: [] };
  const [applicationsDoc, jobsDoc, career] = await Promise.all([
    readClientState<ApplicationsDoc>(tenantId, "wj.applications"),
    readClientState<JobsDoc>(tenantId, "wj.jobs"),
    readClientState<CareerDoc & { reminded?: string[] }>(tenantId, "wj.career"),
  ]);
  const applications = Object.values(applicationsDoc?.applications ?? {});
  if (!applications.length) return report;

  const jobs = jobsDoc?.jobs ?? {};
  const reminded = new Set(career?.reminded ?? []);
  const notifications: Notification[] = [];
  const at = now.toISOString();
  // Their choice per kind: a reminder they keep out of the bell is still pushed or emailed as they chose.
  const inBell = await bellFilter(tenantId);

  for (const app of applications) {
    for (const f of app.followUps ?? []) {
      if (reminded.has(f.id) || !isDueForReminder(f, now.getTime(), leads)) continue;
      reminded.add(f.id);
      const job = jobs[app.jobId];
      const company = job?.company ?? "employer";
      const overdue = new Date(f.dueAt).getTime() < now.getTime();
      const notification: Notification =
        f.kind === "interview"
          ? {
              id: newId("ntf"),
              at,
              read: false,
              category: "interview_upcoming",
              title: `Interview ${overdue ? "was due" : "coming up"} — ${company}`,
              body: `${job?.title ?? "Role"}. Wonder prepared a prep sheet.`,
              href: `/app/applications/${app.id}/interview`,
            }
          : {
              id: newId("ntf"),
              at,
              read: false,
              category: "follow_up_due",
              title: `Follow-up ${overdue ? "overdue" : "due soon"} — ${company}`,
              body: f.note,
              href: `/app/applications/${app.id}`,
            };
      // Their own reminder: the bell only when they picked In app; otherwise their choice per kind.
      const chosen = cleanReminder(f.remind)?.channels;
      if (chosen ? chosen.includes("app") : inBell(notification.category)) notifications.push(notification);
      report.notices.push({ notice: { category: notification.category, title: notification.title, body: notification.body, href: notification.href }, key: `reminder-${f.id}`, ...(chosen ? { channels: chosen } : {}) });
    }
  }

  if (!report.notices.length) return report;
  report.raised = report.notices.length;
  // Merged, not replaced: the candidate's tab may have written since this snapshot was read.
  await writeClientState<CareerDoc & { reminded: string[] }>(
    tenantId,
    "wj.career",
    PERSIST_VERSION.career,
    {
      notifications: [...notifications, ...(career?.notifications ?? [])].slice(0, NOTIFICATION_CAP),
      reminded: [...reminded].slice(-REMINDED_CAP),
    },
    { merge: true },
  );
  return report;
}
