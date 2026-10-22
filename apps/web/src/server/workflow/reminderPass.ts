/**
 * Raises every due interview and follow-up reminder across accounts and nudges each person (push, or email
 * when no push reached them, as their Notify me about choices allow). Cheap — a read per account and a write
 * only when there's something to say — and idempotent through `career.reminded`, so it can run as often as
 * it's called: by the daily job and by the reminders check every few hours.
 */
import { nudge } from "@/server/notifications/deliver";
import { listTenantsWithDueReminders } from "./dueTenants";
import { raiseDueReminders } from "./reminders";
import { reminderLeads } from "@/domain/notifications/admin";
import { loadNotifyAdmin } from "@/server/notifications/admin";

export interface ReminderPassReport {
  tenants: number;
  raised: number;
  failures: { tenantId: string; error: string }[];
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
      for (const n of r.notices) await nudge(tenantId, n.notice, { email: { key: n.key } }, now);
    } catch (e) {
      report.failures.push({ tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
