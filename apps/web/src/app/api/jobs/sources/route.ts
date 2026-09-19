import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { sourceAvailability } from "@/server/jobs/search";

export const runtime = "nodejs";

/**
 * What this deployment can do for the signed-in candidate: which job sources it can query
 * (credentialed ones report false until configured), and whether scheduled runs fire on the server.
 * The second answer decides who ticks the schedule — see `services/scheduler.ts`.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ available: sourceAvailability(), scheduledRuns: process.env.CRON_SECRET ? "server" : "browser" }, { headers: { "cache-control": "private, max-age=300" } });
}
