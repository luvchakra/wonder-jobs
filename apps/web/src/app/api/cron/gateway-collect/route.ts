import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { runGatewayCollection } from "@/server/gateway/collectJob";
import { siteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler → Gateway collection (server/gateway/collectJob.ts): live sources that are due are collected, a Setup job
 * is carried on (and waiting sources queued, when the Scheduler says so), and Find is refreshed when anything new
 * arrived. Vercel Cron (daily) and GitHub Actions (hourly) call it with `CRON_SECRET` as `Authorization: Bearer …`.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runGatewayCollection("cron", siteUrl().origin);
  console.info("[gateway-collect]", r.summary);
  return NextResponse.json(r);
}
