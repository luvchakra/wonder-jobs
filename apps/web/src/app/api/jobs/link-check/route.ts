import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { checkLinksWithOrigins } from "@/server/jobs/origin";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ urls: z.array(z.string().url().max(2048)).min(1).max(25) });

/**
 * Are these job postings still open on their own sites? Only http(s) public addresses are fetched (SSRF-safe).
 * For a job board's posting (Adzuna) the answer also says which site it lives on (`origin`), recorded once and
 * shared, so the board's link isn't followed again for the next candidate.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`link-check:${session.tenantId}`, { capacity: 20, refillPerSec: 1 / 3 });
  if (!rl.ok) return NextResponse.json({ error: "Too many checks at once." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const urls = parsed.data.urls.filter((u) => /^https?:\/\//i.test(u));
  const checked = await checkLinksWithOrigins(urls);
  // Only the verdict and the origin's host go back — never the followed URL.
  const results = Object.fromEntries(Object.entries(checked).map(([u, r]) => [u, { status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.origin ? { origin: r.origin } : {}) }]));
  return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
}
