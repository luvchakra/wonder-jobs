import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { reconcileSubscriptions, type ReconcileReport } from "@/server/billing/service";
import { reportApiUsage, type ApiUsageReport } from "@/server/jobslake/apiBilling";
import { purgeExpired } from "@/server/privacy/retention";
import { listTenantsWithDueSchedules } from "@/server/workflow/dueTenants";
import { runReminderPass } from "@/server/workflow/reminderPass";
import { runDueSchedules, type ScheduledRunReport } from "@/server/workflow/scheduledRun";
import { runModuleSchedulePass } from "@/server/schedules/run";
import { cronEarlyWindowMs } from "@/server/workflow/cronCadence";
import { sendDigest } from "@/server/digest/send";
import { stateStore } from "@/server/state";
import { getSupabaseAdmin } from "@/server/supabase";
import { loadScheduler, recordCronRun } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel's ceiling for a scheduled function; the per-tenant budget below keeps us inside it. */
export const maxDuration = 300;

/** Leave room to finish writing state and answer, rather than being killed mid-save. */
const INVOCATION_BUDGET_MS = 240_000;
// How many tenants a run takes and how long each may use: platform admin → Scheduler (defaults 200 and 60 s).

/**
 * Fires every tenant's due scheduled runs, and raises every due reminder (spec §18, §45).
 *
 * Until now both of these only happened while the candidate had a tab open, which made "every weekday
 * at 08:00" — and "your interview is tomorrow" — promises the product couldn't keep. Vercel Cron calls
 * this; it does the same work the browser's scheduler did, against persisted state, for everyone.
 *
 * Authentication: `CRON_SECRET`, which Vercel sends as `Authorization: Bearer …` on scheduled
 * invocations. With no secret configured the endpoint refuses to run rather than standing open.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const now = new Date();
  const settings = (await loadScheduler()).scheduledRuns;
  const MAX_TENANTS = settings.maxTenants;
  const TENANT_BUDGET_MS = settings.tenantBudgetSec * 1000;
  if (!settings.enabled) {
    await recordCronRun({ job: "scheduled-runs", trigger: "cron", startedAt: now.toISOString(), finishedAt: new Date().toISOString(), outcome: "skipped", summary: "Turned off in Scheduler" });
    return NextResponse.json({ ok: true, skipped: "turned off in Scheduler", at: now.toISOString() });
  }
  // Once a day (Hobby), also take what falls due in the next hour rather than leaving it a whole day.
  const earlyMs = cronEarlyWindowMs();
  const reports: ScheduledRunReport[] = [];
  const failures: { tenantId: string; error: string }[] = [];
  let tenants: string[] = [];
  try {
    tenants = await listTenantsWithDueSchedules(now, MAX_TENANTS, earlyMs);
  } catch (e) {
    console.error("[cron] due-schedule lookup failed:", e instanceof Error ? e.message : "unknown");
    await recordCronRun({ job: "scheduled-runs", trigger: "cron", startedAt: now.toISOString(), finishedAt: new Date().toISOString(), outcome: "failed", summary: "Could not look for due schedules" });
    return NextResponse.json({ ok: false, error: "Could not look for due schedules" }, { status: 502 });
  }

  let deferred = 0;
  for (const tenantId of tenants) {
    if (Date.now() - startedAt > INVOCATION_BUDGET_MS) {
      // Their schedules are still due, so the next tick picks them up — nothing is lost by stopping here.
      deferred = tenants.length - reports.length - failures.length;
      break;
    }
    try {
      // One tenant's bad day is not everyone's: a failure here is recorded and the loop moves on.
      const report = await runDueSchedules(tenantId, { now, timeoutMs: TENANT_BUDGET_MS, earlyMs });
      if (report) reports.push(report);
    } catch (e) {
      failures.push({ tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Every other module's scheduled searches (wj.m.schedules): each due one runs its module's own search, and the person
  // hears only about listings that weren't there before.
  let moduleRuns = { tenants: 0, ran: 0, notified: 0 };
  try {
    const m = await runModuleSchedulePass(now, MAX_TENANTS, startedAt + INVOCATION_BUDGET_MS, earlyMs);
    moduleRuns = { tenants: m.tenants, ran: m.ran, notified: m.notified };
    failures.push(...m.failures);
  } catch (e) {
    failures.push({ tenantId: "*", error: `module schedules: ${e instanceof Error ? e.message : String(e)}` });
  }

  // Reminders are cheap (a read, and a write only when there is something to say), so they run even
  // when the schedule pass used most of the budget — a missed interview reminder is worse than a late run.
  let reminded = 0;
  let remindedTenants = 0;
  if (settings.reminders) {
    try {
      const r = await runReminderPass(now, MAX_TENANTS, startedAt + INVOCATION_BUDGET_MS);
      reminded = r.raised;
      remindedTenants = r.tenants;
      failures.push(...r.failures);
    } catch (e) {
      failures.push({ tenantId: "*", error: `reminders: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // Activity digests: after the runs above, so a digest includes what they just found. Only for accounts
  // with a sign-in email; each tenant at most once a day and only when something happened (sendDigest).
  const digests = { sent: 0, skipped: 0, notSent: 0 };
  if (settings.digests && getSupabaseAdmin()) {
    try {
      for (const tenantId of await stateStore.listTenants("wj.career", MAX_TENANTS)) {
        if (Date.now() - startedAt > INVOCATION_BUDGET_MS) break;
        try {
          const r = await sendDigest(tenantId, { now });
          if (r.sent) digests.sent++;
          else if (r.reason === "no activity" || r.reason === "turned off" || r.reason === "already sent today") digests.skipped++;
          else digests.notSent++;
        } catch (e) {
          failures.push({ tenantId, error: `digest: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    } catch (e) {
      failures.push({ tenantId: "*", error: `digests: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // Daily controls: billing reconciliation against the providers, and retention purges.
  let billing: ReconcileReport | null = null;
  let purged: { contactMessages: number } | null = null;
  try {
    billing = await reconcileSubscriptions();
  } catch (e) {
    failures.push({ tenantId: "*", error: `billing reconciliation: ${e instanceof Error ? e.message : String(e)}` });
  }
  // WorksLake API pay-as-you-go: re-read each subscription from Stripe and report yesterday's overage (once per day, idempotent).
  let apiUsage: ApiUsageReport | null = null;
  try {
    apiUsage = await reportApiUsage(now);
  } catch (e) {
    failures.push({ tenantId: "*", error: `jobslake api usage report: ${e instanceof Error ? e.message : String(e)}` });
  }
  try {
    purged = await purgeExpired(now);
  } catch (e) {
    failures.push({ tenantId: "*", error: `retention purge: ${e instanceof Error ? e.message : String(e)}` });
  }

  await recordCronRun({
    job: "scheduled-runs",
    trigger: "cron",
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    outcome: failures.length && !reports.length ? "failed" : "ok",
    summary: [`${tenants.length} with schedules due`, `${reports.length} ran`, moduleRuns.ran && `${moduleRuns.ran} module searches (${moduleRuns.notified} with news)`, deferred && `${deferred} deferred`, settings.reminders ? `${reminded} reminders` : "reminders off", settings.digests ? `${digests.sent} digests` : "digests off", failures.length && `${failures.length} failures`].filter(Boolean).join(" · "),
  });
  return NextResponse.json({
    ok: true,
    billing,
    apiUsage,
    purged,
    at: now.toISOString(),
    tenantsDue: tenants.length,
    ran: reports.length,
    moduleRuns,
    deferred,
    reminders: { tenants: remindedTenants, raised: reminded },
    digests,
    tookMs: Date.now() - startedAt,
    outcomes: reports,
    failures,
  });
}
