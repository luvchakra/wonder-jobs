import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { sendDueReminders } from "@/server/careers";
import { recordCronRun } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily (Vercel Cron, bearer CRON_SECRET): reminds hiring teams of career-site applications that have waited on
 * them too long. Refuses to run with no secret configured rather than standing open.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  try {
    const report = await sendDueReminders();
    await recordCronRun({ job: "application-reminders", trigger: "cron", startedAt, finishedAt: new Date().toISOString(), outcome: "ok", summary: `${report.applications} waiting · ${report.emails} reminders sent` }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...report, at: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] application reminders failed", e instanceof Error ? e.message.slice(0, 300) : e);
    await recordCronRun({ job: "application-reminders", trigger: "cron", startedAt, finishedAt: new Date().toISOString(), outcome: "failed", summary: "Reminders failed" }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "Reminders failed" }, { status: 500 });
  }
}
