import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { actOnConnection } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Act = z.object({ action: z.enum(["accept", "ignore", "withdraw", "remove"]) });

/** Accept or ignore a request, take one back, or remove a connection. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s, b) => actOnConnection(s, id, b.action), { schema: Act, write: true });
}
