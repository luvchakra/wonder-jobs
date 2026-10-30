import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { cancelMySession } from "@/server/therapists/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.literal("cancel") });

/** The client cancels their request, or a confirmed session before it starts. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s) => {
      const out = await cancelMySession(s, id);
      after(out.notify);
      return { status: out.status };
    },
    { schema: Body, write: true },
  );
}
