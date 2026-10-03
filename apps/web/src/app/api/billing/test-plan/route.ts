import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { isAdminSession } from "@/server/jobslake/access";
import { paymentsLive } from "@/server/billing/service";
import { writeTestPlan } from "@/server/billing/plansConfig";
import { PLAN_IDS, type PlanId } from "@/domain/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { plan: "free" | "pro" | "max" | null } — switch this account to a plan for testing, without paying.
 * Pre-launch only: allowed while no payment provider is connected, and always for platform admins.
 * A real subscription is never changed by this, and every switch is audited.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`billing-test:${session.tenantId}`, { capacity: 10, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const admin = isAdminSession(session);
  if (!admin && paymentsLive()) return NextResponse.json({ error: "Testing plans are off now that payments are live." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { plan?: unknown } | null;
  const plan = body?.plan === null ? null : (PLAN_IDS as readonly string[]).includes(String(body?.plan)) ? (body!.plan as PlanId) : undefined;
  if (plan === undefined) return NextResponse.json({ error: "Choose Free, Pro or Max." }, { status: 400 });
  await writeTestPlan(session.tenantId, plan, admin);
  await recordServerAudit(session.tenantId, { actionId: `test-plan:${session.tenantId}`, actionType: "test_plan", event: `test_plan_${plan ?? "cleared"}` });
  return NextResponse.json({ plan });
}
