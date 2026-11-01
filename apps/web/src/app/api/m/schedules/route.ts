import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { moduleScheduleStatus } from "@/server/schedules/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/m/schedules — each of the person's module scheduled searches: next run and what it last found. Their own only. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ runs: await moduleScheduleStatus(session.tenantId) }, { headers: { "cache-control": "no-store" } });
}
