import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchInternships } from "@/server/internships/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().trim().min(1, "Say what field you want to intern in.").max(120), places: z.array(z.string().max(80)).max(5), refresh: z.boolean().optional() });

/** Internships Find: the student's words and places, searched across the Internships dataset's sources (never Jobs'). */
export async function POST(req: Request) {
  return hiringRoute(req, (_s, b) => searchInternships(b), { schema: Body, write: true });
}
