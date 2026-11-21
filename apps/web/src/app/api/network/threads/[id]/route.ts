import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { sendMessage, thread } from "@/server/network/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One conversation with a connection: the other person and the messages. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => thread(s, id));
}

const Body = z.object({ body: z.string().min(1).max(4000), confirmed: z.boolean().optional() });

/** Send a message: the caller's own typed and sent press (network.message, checked on the server), audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ message: await sendMessage(s, id, b.body, b.confirmed) }), { schema: Body, write: true });
}
