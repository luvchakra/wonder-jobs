import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { clientAct, myRequest } from "@/server/services/requests";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), booking: z.object({ address: z.string().max(300).optional(), phone: z.string().max(20).optional() }).optional(), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("paid") }),
  z.object({ action: z.literal("review"), review: z.object({ rating: z.number().int().min(1).max(5), text: z.string().max(1000).optional() }) }),
  z.object({ action: z.literal("issue"), text: z.string().max(1000) }),
]);

/** One of the client's own requests, with its history. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => myRequest(s, id));
}

/** The client's next move: accept (books it — services.book, checked on the server, audited), cancel, paid, review, problem. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await clientAct(s, id, b);
      if (b.action === "accept") await recordServerAudit(s.tenantId, { actionId: `services-book:${id}`, actionType: "services.book", event: "BOOKED", detail: out.booked });
      after(out.notify);
      return { status: out.status };
    },
    { schema: Body, write: true },
  );
}
