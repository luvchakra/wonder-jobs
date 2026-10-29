import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchTeaching } from "@/server/teaching/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().trim().min(1, "Say which subject you teach.").max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Teaching Find: the teacher's words and places, searched across the Teaching dataset's sources (never Jobs'). */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchTeaching(b), { schema: Body, write: true });
}
