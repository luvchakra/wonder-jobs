import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { listTenantsWithDueSchedules } from "@/server/workflow/dueTenants";
import { runDueSchedules, type ScheduledRunReport } from "@/server/workflow/scheduledRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel's ceiling for a scheduled function; the per-tenant budget below keeps us inside it. */
export const maxDuration = 300;

/** Leave room to finish writing state and answer, rather than being killed mid-save. */
const INVOCATION_BUDGET_MS = 240_000;
const TENANT_BUDGET_MS = 60_000;
const MAX_TENANTS = 200;

/**
 * Fires every tenant's due scheduled runs (spec §18).
 *
 * Until now a schedule only fired while the candidate had a tab open, which made "every weekday at
 * 08:00" a promise the product couldn't keep. Vercel Cron calls this; it does the same work the
 * browser's scheduler did, against persisted state, for everyone at once.
 *
 * Authentication: `CRON_SECRET`, which Vercel sends as `Authorization: Bearer …` on scheduled
 * invocations. With no secret configured the endpoint refuses to run rather than standing open.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const reports: ScheduledRunReport[] = [];
  const failures: { tenantId: string; error: string }[] = [];
  let tenants: string[] = [];
  try {
    tenants = await listTenantsWithDueSchedules(now, MAX_TENANTS);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not look for due schedules" }, { status: 502 });
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
      const report = await runDueSchedules(tenantId, { now, timeoutMs: TENANT_BUDGET_MS });
      if (report) reports.push(report);
    } catch (e) {
      failures.push({ tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    tenantsDue: tenants.length,
    ran: reports.length,
    deferred,
    tookMs: Date.now() - startedAt,
    outcomes: reports,
    failures,
  });
}
