import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchCofounders } from "@/server/cofounders/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No words: the module's latest listings (owner, 2026-11-01), so the query may be empty.
const Body = z.object({ query: z.string().trim().max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Co-founders Find: the searcher's words and places, searched across the Co-founders dataset only (never another module's). */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => searchCofounders(s, b), { schema: Body, write: true });
}
