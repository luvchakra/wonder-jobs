import { after, NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { continueSetupJob, handOnSetupJob } from "@/server/gateway/setupJob";
import { siteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Setup to-do's server job, continued (server/gateway/setupJob.ts): works on what's left for up to its time budget and,
 * if items remain, hands them to the next call. Called by the job itself and by the hourly gateway collection, with
 * `CRON_SECRET` as `Authorization: Bearer …`. Answers at once; the work runs after the answer.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = siteUrl().origin;
  after(async () => {
    const r = await continueSetupJob();
    console.info("[gateway-setup]", JSON.stringify(r));
    if (r.left && r.ran) await handOnSetupJob(origin, expected);
  });
  return NextResponse.json({ ok: true, accepted: true });
}
