import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { collectGatewaySource, gatewayOverview } from "@/server/gateway/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The gateway's sources, runs and listings for platform admins (Platform → WorksLake → Gateway). */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await gatewayOverview());
}

/** "Collect now" for one active source. Same checks as a scheduled run (robots, permission, quality); audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 2_000)) as { sourceId?: unknown } | null;
  const sourceId = typeof body?.sourceId === "string" && /^src_[a-f0-9]{24}$/.test(body.sourceId) ? body.sourceId : null;
  if (!sourceId) return jlError("INVALID_REQUEST", "Name the gateway source to collect.", 400);
  const r = await collectGatewaySource(sourceId);
  await audit(a.actor, "gateway.collect", sourceId, { ok: r.ok, ...(r.ok ? { valid: r.valid } : { code: r.code }) });
  return json(r, r.ok ? 200 : 422);
}
