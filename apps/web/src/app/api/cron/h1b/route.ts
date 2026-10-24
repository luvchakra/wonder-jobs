import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { loadH1b, type H1bUpload } from "@/server/jobslake/h1b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4_000_000;

/**
 * Loads a Department of Labor H-1B disclosure file's per-employer totals (gzipped JSON, `H1bUpload`), replacing
 * the last file's. Called quarterly by the "H-1B data" GitHub workflow with `CRON_SECRET` as `Authorization: Bearer …`.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length > MAX_BYTES) return NextResponse.json({ error: "The upload is too large" }, { status: 413 });
    const json = gunzipSync(body, { maxOutputLength: 40_000_000 }).toString("utf8");
    const r = await loadH1b(JSON.parse(json) as H1bUpload);
    console.info("[h1b]", JSON.stringify(r));
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The upload failed" }, { status: 400 });
  }
}
