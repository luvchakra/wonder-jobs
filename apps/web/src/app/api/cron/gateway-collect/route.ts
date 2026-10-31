import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { hostedGateway } from "@/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The gateway's daily collection: every active source that is due is fetched (robots and permission checked again),
 * normalised and stored. Sources are active only after an administrator tested and activated them. Vercel Cron calls it
 * with `CRON_SECRET` as `Authorization: Bearer …`; with no secret, or no gateway configured, it does nothing.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hosted = hostedGateway();
  if (!hosted) return NextResponse.json({ ok: true, skipped: "gateway not configured" });
  const outcomes = await hosted.gateway.collectDue();
  console.info("[gateway-collect]", JSON.stringify(outcomes.map((o) => ({ source: o.sourceId, ok: o.ok, code: o.code, valid: o.valid }))));
  return NextResponse.json({ ok: outcomes.every((o) => o.ok), outcomes });
}
