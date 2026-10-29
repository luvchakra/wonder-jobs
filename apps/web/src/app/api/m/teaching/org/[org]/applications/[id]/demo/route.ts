import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { proposeDemo } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ startsAt: z.string().max(40), durationMin: z.number().int(), mode: z.enum(["online", "in_person"]), where: z.string().max(400), note: z.string().max(1000).optional() });

/** Book a demo class on an application (applications.decide); the teacher confirms or declines it. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => proposeDemo(s, org, id, b), { schema: Body, write: true });
}
