import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { searchMarketplace } from "@/server/marketplace/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ query: z.string().max(200), places: z.array(z.string().max(80)).max(5).default([]), refresh: z.boolean().optional() });

/** Search WonderWorks listings for the person's own words and area: the module's own WorksLake dataset, never anyone they blocked. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => searchMarketplace(s, b), { schema: Body });
}
