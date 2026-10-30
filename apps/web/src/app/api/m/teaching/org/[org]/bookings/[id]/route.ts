import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { answerDemo } from "@/server/teaching/bookings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ status: z.enum(["confirmed", "declined", "held", "cancelled"]) });

/** The school confirms or declines a requested demo class, marks one held, or cancels one (applications.decide). */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => answerDemo(s, org, id, b.status), { schema: Body, write: true });
}
