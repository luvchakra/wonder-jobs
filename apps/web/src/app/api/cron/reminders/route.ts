import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { loadScheduler, recordCronRun } from "@/server/scheduler/store";
import { runReminderPass } from "@/server/workflow/reminderPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every hour (GitHub Actions, bearer CRON_SECRET — Vercel's plan runs its own crons once a day): raises the
 * interview and follow-up reminders that fell due since the last check, so one due this evening isn't raised
 * tomorrow morning. Idempotent; the daily run does the same. Off when Scheduler → reminders is off.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date();
  const settings = (await loadScheduler()).scheduledRuns;
  if (!settings.enabled || !settings.reminders) {
    await recordCronRun({ job: "reminders", trigger: "cron", startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), outcome: "skipped", summary: "Reminders turned off in Scheduler" });
    return NextResponse.json({ ok: true, skipped: "turned off in Scheduler" });
  }
  try {
    const r = await runReminderPass(startedAt, settings.maxTenants, startedAt.getTime() + 50_000);
    await recordCronRun({ job: "reminders", trigger: "cron", startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), outcome: r.failures.length && !r.raised ? "failed" : "ok", summary: [`${r.raised} reminders`, `${r.tenants} accounts`, r.failures.length && `${r.failures.length} failures`].filter(Boolean).join(" · ") });
    return NextResponse.json({ ok: true, ...r, failures: r.failures.length, at: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] reminders failed", e instanceof Error ? e.message.slice(0, 300) : e);
    await recordCronRun({ job: "reminders", trigger: "cron", startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), outcome: "failed", summary: "Reminders failed" }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "Reminders failed" }, { status: 500 });
  }
}
