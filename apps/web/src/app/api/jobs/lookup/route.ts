import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { lookupJobs, MAX_LOOKUP } from "@/server/jobs/recover";

export const runtime = "nodejs";

/** GET ?ids=a,b — jobs the candidate saved or applied to, found again after they left the search results. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`jobs-lookup:${session.tenantId}`, { capacity: 120, refillPerSec: 2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Give it a minute." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_LOOKUP);
  if (!ids.length) return NextResponse.json({ jobs: [] });
  return NextResponse.json({ jobs: await lookupJobs(ids) }, { headers: { "cache-control": "private, max-age=300" } });
}
