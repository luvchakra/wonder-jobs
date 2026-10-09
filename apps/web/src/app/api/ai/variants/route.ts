import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { assist } from "@/server/ai/assist";
import { ruleVariants, searchVariants, MAX_VARIANTS } from "@/domain/jobs/variants";
import { queryTerms } from "@/services/jobs/normalize";

export const runtime = "nodejs";

const s = (n: number) => z.string().max(n);
const Body = z.object({
  query: z.string().trim().min(1).max(160),
  profile: z.object({ roleWanted: s(200), headline: s(200), titles: z.array(s(120)).max(10), skills: z.array(s(80)).max(25) }),
});
const Reply = z.object({ queries: z.array(z.string().max(120)).max(6) });

/**
 * Smart search: a model proposes broader phrasings of the search to run alongside it. Each is kept only
 * if every word is the candidate's own (their search or profile) — never a new role — and the rules fill
 * the rest (`searchVariants`). Without a model answer, the rules alone decide.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ variants: [], fromAi: [] }, { status: 400 });
  const { query, profile } = parsed.data;
  const rules = { variants: ruleVariants(query).slice(0, MAX_VARIANTS), fromAi: [] as string[] };
  if (!rateLimit(`variants:${session.tenantId}`, { capacity: 10, refillPerSec: 0.1 }).ok) return NextResponse.json(rules, { headers: { "cache-control": "no-store" } });
  const reply = await assist({
    task: "search_variants",
    instructions:
      'A job seeker is searching for a role. Propose up to 4 broader ways employers commonly post the same role or field, from most to least specific, so a search also finds near matches (e.g. without the level, or the field alone). Use only words that appear in the search or the candidate\'s profile; no new words, no locations. Shape: {"queries":["<phrase>", ...]}.',
    data: JSON.stringify({ search: query, ...profile }),
    schema: Reply,
    maxTokens: 120,
    timeoutMs: 6000,
  });
  const vocabulary = new Set(queryTerms([query, profile.roleWanted, profile.headline, ...profile.titles, ...profile.skills].join(" "), 1000));
  return NextResponse.json(reply ? searchVariants(query, reply.queries, vocabulary) : rules, { headers: { "cache-control": "no-store" } });
}
