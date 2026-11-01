import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchScholarships } from "@/server/scholarships/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No words: the module's latest listings, so the query may be empty.
const Body = z.object({ query: z.string().trim().max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Scholarships & Projects Find: the student's words and places, searched across this module's own sources (never another's). */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchScholarships(b), { schema: Body, write: true });
}
