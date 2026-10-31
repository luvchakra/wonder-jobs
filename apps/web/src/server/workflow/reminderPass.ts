/**
 * Raises every due interview and follow-up reminder across accounts and nudges each person (push, or email
 * when no push reached them, as their Notify me about choices allow). Cheap — a read per account and a write
 * only when there's something to say — and idempotent through `career.reminded`, so it can run as often as
 * it's called: by the daily job and by the reminders check every hour.
 */
import { nudge, nudgeChosen } from "@/server/notifications/deliver";
import { listTenantsWithDueReminders } from "./dueTenants";
import { raiseDueReminders } from "./reminders";
import { reminderLeads } from "@/domain/notifications/admin";
import { loadNotifyAdmin } from "@/server/notifications/admin";
import { runEventReminders } from "@/server/events/calendar";

export interface ReminderPassReport {
  tenants: number;
  raised: number;
  failures: { tenantId: string; error: string }[];
  /** Events & Social: reminders for events starting within a day, once per RSVP. */
  events?: { raised: number; failures: number };
}

export async function runReminderPass(now: Date, maxTenants: number, deadline: number): Promise<ReminderPassReport> {
  const report: ReminderPassReport = { tenants: 0, raised: 0, failures: [] };
  // How early reminders are raised: the platform's setting (Admin → Settings → Notifications).
  const leads = reminderLeads(await loadNotifyAdmin());
  for (const tenantId of await listTenantsWithDueReminders(now, maxTenants)) {
    if (Date.now() > deadline) break;
    try {
      const r = await raiseDueReminders(tenantId, now, leads);
      if (!r.raised) continue;
      report.tenants++;
      report.raised += r.raised;
      // Already in the bell; a push, or an email when no push reached them (once per reminder).
      // One the candidate set on the Calendar goes each way they picked.
      for (const n of r.notices) await (n.channels ? nudgeChosen(tenantId, n.notice, n.channels, n.key, now) : nudge(tenantId, n.notice, { email: { key: n.key } }, now));
    } catch (e) {
      report.failures.push({ tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Events & Social has its own reminder, a day before an event you're going to (server/events/calendar.ts).
  if (Date.now() < deadline) report.events = await runEventReminders(now, deadline).catch(() => ({ raised: 0, failures: 1 }));
  return report;
}
