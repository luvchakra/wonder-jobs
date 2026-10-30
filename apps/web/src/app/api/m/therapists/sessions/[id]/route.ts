import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { cancelMySession, completeMySession } from "@/server/therapists/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [z.object({ action: z.literal("cancel") }), z.object({ action: z.literal("held") })]);

/** The client cancels their request, or a confirmed session before it starts; or marks a started session completed (held). */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "held") return completeMySession(s, id);
      const out = await cancelMySession(s, id);
      after(out.notify);
      return { status: out.status };
    },
    { schema: Body, write: true },
  );
}
