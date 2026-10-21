import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { purgeExpiredApplications, sendDueReminders } from "@/server/careers";
import { recordCronRun } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily (Vercel Cron, bearer CRON_SECRET): deletes career-site applications past their site's retention period,
 * then reminds hiring teams of applications that have waited on them too long. Refuses to run with no secret configured rather than standing open.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  try {
    // Retention first (DPDP / GDPR storage limitation), so nobody is reminded about an application that's due to go.
    const purged = await purgeExpiredApplications();
    const report = await sendDueReminders();
    await recordCronRun({ job: "application-reminders", trigger: "cron", startedAt, finishedAt: new Date().toISOString(), outcome: "ok", summary: `${purged.deleted} deleted after retention · ${report.applications} waiting · ${report.emails} reminders sent` }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...report, deleted: purged.deleted, at: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] application reminders failed", e instanceof Error ? e.message.slice(0, 300) : e);
    await recordCronRun({ job: "application-reminders", trigger: "cron", startedAt, finishedAt: new Date().toISOString(), outcome: "failed", summary: "Reminders failed" }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "Reminders failed" }, { status: 500 });
  }
}
