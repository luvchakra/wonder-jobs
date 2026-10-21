import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { updateWorkspace } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().max(120), website: z.string().max(300).optional() });

/** An Owner changes the company's name or website. */
export async function PATCH(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => updateWorkspace(s, org, b), { schema: Body, write: true });
}
