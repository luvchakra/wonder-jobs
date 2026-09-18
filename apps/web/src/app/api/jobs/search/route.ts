import { NextResponse } from "next/server";
import { z } from "zod";
import { isJobSourceId } from "@/domain/jobs/sources";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { searchSource, SourceNeedsSetupError } from "@/server/jobs/search";

export const runtime = "nodejs";
export const maxDuration = 30;

const Query = z.object({
  source: z.string().min(1).max(40),
  q: z.string().trim().min(1).max(200),
  locations: z.string().max(400).optional(),
});

/**
 * GET /api/jobs/search?source=remotive&q=product%20manager&locations=Bengaluru,Remote
 * Searches one real source for the signed-in user. The run's search stage
 * calls this once per enabled source so progress and evidence stay per-source.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`jobs:${session.tenantId}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many searches. Give it a minute." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const url = new URL(req.url);
  const parsed = Query.safeParse({ source: url.searchParams.get("source"), q: url.searchParams.get("q"), locations: url.searchParams.get("locations") ?? undefined });
  if (!parsed.success || !isJobSourceId(parsed.data.source)) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  const locations = (parsed.data.locations ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const { jobs, cached } = await searchSource(parsed.data.source, { query: parsed.data.q, locations });
    return NextResponse.json({ source: parsed.data.source, jobs, cached, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "private, max-age=60" } });
  } catch (e) {
    if (e instanceof SourceNeedsSetupError) return NextResponse.json({ error: "This source needs credentials on the server.", kind: "needs_setup" }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Source unavailable", kind: "unavailable" }, { status: 502 });
  }
}
