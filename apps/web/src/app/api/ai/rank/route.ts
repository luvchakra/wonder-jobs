import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { aiRankJobs } from "@/server/ai/rank";

export const runtime = "nodejs";
export const maxDuration = 30;

const s = (n: number) => z.string().max(n);
const Body = z.object({
  profile: z.object({ roleWanted: s(200), headline: s(200), level: s(20), years: z.number().min(0).max(80), skills: z.array(s(80)).max(25), industries: z.array(s(60)).max(8), locations: z.array(s(80)).max(6) }),
  jobs: z.array(z.object({ id: s(200), title: s(120), company: s(80), location: s(80), level: s(20), excerpt: s(700) })).max(30),
});

/** AI fit scores for a search's top postings — a proposal the app blends into its own match within a fixed band. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`rank:${session.tenantId}`, { capacity: 6, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ scores: null }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ scores: null }, { status: 400 });
  return NextResponse.json({ scores: await aiRankJobs(parsed.data) }, { headers: { "cache-control": "no-store" } });
}
