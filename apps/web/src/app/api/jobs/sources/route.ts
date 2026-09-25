import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { sourceAvailability } from "@/server/jobs/search";
import { cronOwnsScheduling } from "@/server/workflow/cronCadence";
import { jobsLakeFlags } from "@/server/jobslake/flags";

export const runtime = "nodejs";

/**
 * What this deployment can do for the signed-in candidate: which job sources it can query
 * (credentialed ones report false until configured), and whether scheduled runs fire on the server.
 * The second answer decides who ticks the schedule — see `services/scheduler.ts`. `jobsLake` says
 * whether searches go through JobsLake (and stream) or straight to each source.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const f = jobsLakeFlags();
  return NextResponse.json({ available: sourceAvailability(), scheduledRuns: cronOwnsScheduling() ? "server" : "browser", jobsLake: { search: f.jobsLakeSearchEnabled, streaming: f.jobsLakeStreamingEnabled } }, { headers: { "cache-control": "private, max-age=300" } });
}
