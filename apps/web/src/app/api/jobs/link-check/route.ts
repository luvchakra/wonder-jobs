import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { checkJobLinks } from "@/server/jobs/linkCheck";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ urls: z.array(z.string().url().max(2048)).min(1).max(25) });

/** Are these job postings still open on their own sites? Only http(s) public addresses are fetched (SSRF-safe). */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`link-check:${session.tenantId}`, { capacity: 20, refillPerSec: 1 / 3 });
  if (!rl.ok) return NextResponse.json({ error: "Too many checks at once." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const urls = parsed.data.urls.filter((u) => /^https?:\/\//i.test(u));
  return NextResponse.json({ results: await checkJobLinks(urls) }, { headers: { "cache-control": "no-store" } });
}
