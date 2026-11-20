import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { blockMember, reportMember, requestConnection, viewMember } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A member's network profile, as this viewer may see it. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s) => ({ member: await viewMember(s, id) }));
}

const Act = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), how: z.string().max(40).optional(), note: z.string().max(300).optional(), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("report"), reason: z.string().min(3).max(500) }),
]);

/** Ask to connect, block, or report. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "connect") return { member: await requestConnection(s, id, { how: b.how, note: b.note }, b.confirmed) };
      if (b.action === "block") return blockMember(s, id);
      return reportMember(s, id, b.reason);
    },
    { schema: Act, write: true },
  );
}
