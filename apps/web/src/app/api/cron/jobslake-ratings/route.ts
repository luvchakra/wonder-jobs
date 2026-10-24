import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { runScheduledRatings } from "@/server/jobslake/ratingsSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The company-ratings job's daily tick. It runs the job only when the frequency set in Company ratings says it's
 * due (or a run that ran out of time has more to do), and emails the owner when no API key is left.
 * Vercel Cron calls it with `CRON_SECRET` as `Authorization: Bearer …`; with no secret configured it refuses to run.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runScheduledRatings();
  console.info("[jobslake-ratings]", JSON.stringify({ outcome: r.outcome, reason: r.reason, status: r.report?.status, checked: r.report?.checked, rated: r.report?.rated, left: r.report?.left, email: r.email ? (r.email.sent ? "sent" : "not sent") : undefined }));
  if (r.outcome === "failed") return NextResponse.json({ error: "The ratings run failed" }, { status: 500 });
  return NextResponse.json(r);
}
