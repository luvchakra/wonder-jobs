import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { setDemoStatus } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ status: z.enum(["held", "cancelled"]) });

/** Mark a demo class held, or cancel it (applications.decide). */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => setDemoStatus(s, org, id, b.status), { schema: Body, write: true });
}
