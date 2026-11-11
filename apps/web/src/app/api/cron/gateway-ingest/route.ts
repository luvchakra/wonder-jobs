import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { gatewaySourceModules, gatewayUrlDatasets, ingestByUrl } from "@/server/gateway/admin";
import { dbUsage, loadSafeguards, usageLevel } from "@/server/jobslake/safeguards";
import { refreshGatewayListings } from "@/server/jobslake/warm";
import { readJson } from "@/server/jobslake/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Records a scheduled job collected outside the app (the weekly GitHub OpenStreetMap collection, osm-collect.yml),
 * for the gateway sources read from `url`. Called with `CRON_SECRET` as `Authorization: Bearer …`, like the other
 * scheduled jobs; the gateway maps and checks every record as its own fetch would, and nothing else is accepted.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await readJson(req, 4_000_000)) as { url?: unknown; items?: unknown; merge?: unknown; observedAt?: unknown } | null;
  if (!body || typeof body.url !== "string" || !Array.isArray(body.items)) return NextResponse.json({ error: "Send { url, items }" }, { status: 400 });
  // A bulk delivery to a prospect dataset (WJ-817) is refused while the database is past its alert level: the free
  // plan stops taking writes when full, and prospect rows must never be what fills it.
  if ((await gatewayUrlDatasets(body.url)).length) {
    const [usage, { settings }] = await Promise.all([dbUsage().catch(() => null), loadSafeguards()]);
    if (usage && usageLevel(usage.dbBytes, settings).alert) return NextResponse.json({ ok: false, error: "The database is past its storage alert level (Admin → Storage); nothing was stored" }, { status: 507 });
  }
  const results = await ingestByUrl(body.url, body.items, { ...(typeof body.merge === "boolean" ? { merge: body.merge } : {}), ...(typeof body.observedAt === "string" ? { observedAt: body.observedAt } : {}) });
  console.info("[gateway-ingest]", JSON.stringify(results.map((r) => ({ source: r.sourceId, status: r.status, valid: r.body.valid }))));
  if (!results.length) return NextResponse.json({ ok: false, error: "No gateway source reads this URL (add it from the catalogue first)" }, { status: 404 });
  // The delivered listings reach Find at once: their modules are refreshed (a paused source's are served once activated).
  const modules = (await Promise.all(results.filter((r) => r.status === 200).map((r) => gatewaySourceModules(r.sourceId)))).flat();
  const stored = modules.length ? ((await refreshGatewayListings(modules).catch(() => null))?.stored ?? {}) : {};
  return NextResponse.json({ ok: results.every((r) => r.status === 200 && r.body.ok === true), results, stored });
}
