import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchEvents } from "@/server/events/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().trim().min(1, "Type what you're into — for example board games, running or pottery.").max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Events Find: the person's words and places, searched across the Events dataset's sources (never another module's). */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchEvents(b), { schema: Body, write: true });
}
