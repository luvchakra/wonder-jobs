import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { proAct } from "@/server/services/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quote"),
    quote: z.object({ items: z.array(z.object({ label: z.string().max(120), amount: z.number().int().min(0).max(100_000_000) })).max(11), currency: z.string().length(3).optional(), start: z.string().max(10), slot: z.string().max(12).optional(), deliverBy: z.string().max(10).optional(), validUntil: z.string().max(10).optional(), note: z.string().max(1000).optional(), gstRate: z.number().min(0.01).max(40).optional(), sac: z.string().max(8).optional(), tdsSection: z.string().max(20).optional(), tdsRate: z.number().min(0.01).max(30).optional() }),
  }),
  z.object({ action: z.literal("decline"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("paid") }),
]);

/** The pro's next move on a quote request (applications.decide, checked on the server): quote, decline, done, paid. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => proAct(s, org, id, b), { schema: Body, write: true });
}
