import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchTherapists } from "@/server/therapists/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No words: the module's latest listings (owner, 2026-11-01), so the query may be empty.
const Body = z.object({ query: z.string().trim().max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Therapists Find: the client's words and places, searched across the Therapists dataset's sources (never another module's). The words are not stored. */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchTherapists(b), { schema: Body, write: true });
}
