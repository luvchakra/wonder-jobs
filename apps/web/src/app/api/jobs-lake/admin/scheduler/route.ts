import { NextResponse } from "next/server";
import { CRON_JOBS, SCHEDULER_DEFAULTS, SCHEDULER_LIMITS, describeCron, nextCronRun } from "@/domain/scheduler/settings";
import { isDue } from "@/domain/workflow/schedule";
import type { WorkflowSchedule } from "@/domain/workflow/types";
import { readClientState } from "@/server/clientState";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { runCompanyRefresh } from "@/server/scheduler/companyJob";
import { runGatewayCollection } from "@/server/gateway/collectJob";
import { readSetupJob } from "@/server/gateway/setupJob";
import { lastGatewayRefresh } from "@/server/jobslake/warm";
import { siteUrl } from "@/lib/siteUrl";
import { listCronRuns, loadScheduler, saveScheduler } from "@/server/scheduler/store";
import { stateStore } from "@/server/state";
import { cronIntervalMinutes } from "@/server/workflow/cronCadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TENANTS = 200;

/**
 * Candidates' saved schedules across the platform — only their timing (cadence, next and last run), never
 * the schedule's name, search or results — so an admin can see what the daily run has ahead of it.
 */
async function candidateSchedules(now: Date) {
  const tenants = await stateStore.listTenants("wj.workflow", MAX_TENANTS).catch(() => [] as string[]);
  const rows: { account: string; frequency: string; time: string; timezone: string; enabled: boolean; nextRunAt?: string; lastRunAt?: string; due: boolean }[] = [];
  for (let i = 0; i < tenants.length; i += 10) {
    const docs = await Promise.all(tenants.slice(i, i + 10).map(async (t) => [t, await readClientState<{ schedules?: Record<string, WorkflowSchedule> }>(t, "wj.workflow").catch(() => undefined)] as const));
    for (const [tenant, doc] of docs)
      for (const s of Object.values(doc?.schedules ?? {}))
        if (s && s.trigger === "schedule")
          rows.push({ account: `${tenant.slice(0, 8)}…`, frequency: s.frequency, time: s.time, timezone: s.timezone, enabled: s.enabled, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, due: isDue(s, now) });
  }
  rows.sort((a, b) => (a.nextRunAt ?? "9").localeCompare(b.nextRunAt ?? "9"));
  return { accounts: new Set(rows.map((r) => r.account)).size, total: rows.length, enabled: rows.filter((r) => r.enabled).length, dueNow: rows.filter((r) => r.due).length, list: rows.slice(0, 100) };
}

export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const now = new Date();
  const [settings, runs, schedules, refresh, setupJob] = await Promise.all([loadScheduler(), listCronRuns(), candidateSchedules(now), lastGatewayRefresh().catch(() => null), readSetupJob().catch(() => null)]);
  return json({
    settings,
    defaults: SCHEDULER_DEFAULTS,
    limits: SCHEDULER_LIMITS,
    cron: { secretSet: !!process.env.CRON_SECRET, intervalMinutes: cronIntervalMinutes() },
    jobs: CRON_JOBS.map((j) => ({ ...j, when: describeCron(j.schedule), nextRunAt: nextCronRun(j.schedule, now), lastRun: runs.find((r) => r.job === j.id) })),
    runs,
    schedules,
    gateway: {
      refresh,
      job: setupJob && !setupJob.finishedAt ? { done: setupJob.items.filter((i) => i.status === "live" || i.status === "failed").length, total: setupJob.items.length } : null,
    },
  });
}

/** Save the scheduler's settings (every value checked and kept in range). */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (!body) return badJson();
  const saved = await saveScheduler(body, a.actor);
  await audit(a.actor, "scheduler.update", undefined, { scheduledRuns: saved.scheduledRuns, companyRefresh: saved.companyRefresh, gateway: saved.gateway });
  return json({ settings: saved });
}

/**
 * Run now: the company refresh, with the saved limits, or the gateway collection, the same code the cron runs (the
 * daily run stays with the cron, which has 5 minutes).
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req)) as { job?: string } | null;
  if (body?.job !== "jobslake-companies" && body?.job !== "gateway-collect") return jlError("INVALID_REQUEST", "Only the company refresh and the gateway collection can be run from here.", 400);
  await audit(a.actor, "scheduler.run", undefined, { job: body.job });
  if (body.job === "gateway-collect") return json(await runGatewayCollection("admin", siteUrl().origin));
  const r = await runCompanyRefresh("admin");
  return json(r, r.outcome === "failed" ? 500 : 200);
}
