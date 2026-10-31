import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchCofounders } from "@/server/cofounders/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().trim().min(1, "Type a skill, a place or an idea — for example fintech or sales.").max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Co-founders Find: the searcher's words and places, searched across the Co-founders dataset only (never another module's). */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => searchCofounders(s, b), { schema: Body, write: true });
}
