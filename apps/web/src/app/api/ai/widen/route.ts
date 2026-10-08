import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { assist } from "@/server/ai/assist";
import { checkedWiderQuery } from "@/domain/jobs/readiness";
import { queryTerms } from "@/services/jobs/normalize";

export const runtime = "nodejs";

const s = (n: number) => z.string().max(n);
const Body = z.object({
  query: z.string().trim().min(1).max(160),
  profile: z.object({ roleWanted: s(200), headline: s(200), titles: z.array(s(120)).max(10), skills: z.array(s(80)).max(25) }),
});
const Reply = z.object({ query: z.string().max(120) });

/**
 * A search found nothing: a model proposes one more common way to say the same role. The proposal is kept
 * only if every word of it is the candidate's own (their profile or their search) — never a new role.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`widen:${session.tenantId}`, { capacity: 4, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ query: null }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ query: null }, { status: 400 });
  const { query, profile } = parsed.data;
  const reply = await assist({
    task: "widen_search",
    instructions:
      'A job search found no postings. Propose one shorter or more commonly posted job title for the same role the candidate wants, so a search finds postings. Use only words that appear in the search or the candidate\'s profile; no new words, no location, no seniority unless the search had one. Shape: {"query":"<title>"}.',
    data: JSON.stringify({ search: query, ...profile }),
    schema: Reply,
    maxTokens: 60,
    timeoutMs: 6000,
  });
  const vocabulary = new Set(queryTerms([query, profile.roleWanted, profile.headline, ...profile.titles, ...profile.skills].join(" "), 1000));
  return NextResponse.json({ query: checkedWiderQuery(reply?.query, query, vocabulary) }, { headers: { "cache-control": "no-store" } });
}
