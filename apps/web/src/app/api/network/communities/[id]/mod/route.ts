import { hiringRoute } from "@/server/hiringRoute";
import { modLog, modQueue } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?view=queue (moderators who review posts) or log (any moderator). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const view = new URL(req.url).searchParams.get("view");
  return hiringRoute(req, async (s) => (view === "log" ? { log: await modLog(s, id) } : { queue: await modQueue(s, id) }));
}
