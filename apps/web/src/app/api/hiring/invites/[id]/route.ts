import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { acceptInvite, declineInvite } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["accept", "decline"]) });

/** Accept or decline an invitation sent to the caller's own email. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s, b) => (b.action === "accept" ? acceptInvite(s, id) : declineInvite(s, id)), { schema: Body, write: true });
}
