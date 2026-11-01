import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchEvents } from "@/server/events/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No words: the module's latest listings (owner, 2026-11-01), so the query may be empty.
const Body = z.object({ query: z.string().trim().max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Events Find: the person's words and places, searched across the Events dataset's sources (never another module's). */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchEvents(b), { schema: Body, write: true });
}
