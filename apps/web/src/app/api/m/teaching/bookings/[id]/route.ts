import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { answerDemo } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ answer: z.enum(["confirmed", "declined"]) });

/** The teacher confirms or declines a demo class the school proposed. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s, b) => answerDemo(s, id, b.answer), { schema: Body, write: true });
}
