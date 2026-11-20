import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { shareListing, updatesFor } from "@/server/network/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the caller's connections did and chose to share. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ updates: await updatesFor(s) }));
}

const Share = z.object({ page: z.string().max(260), title: z.string().min(1).max(300) });

/** Share a listing's public page with the caller's connections. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => shareListing(s, b), { schema: Share, write: true });
}
