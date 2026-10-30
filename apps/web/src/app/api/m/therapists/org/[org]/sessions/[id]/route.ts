import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { practitionerAct } from "@/server/therapists/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), session: z.object({ date: z.string().max(10), time: z.string().max(5), minutes: z.number().int().min(10).max(300), where: z.string().max(300).optional() }) }),
  z.object({ action: z.literal("decline"), reason: z.enum(["full", "new_clients", "fit"]) }),
  z.object({ action: z.literal("held") }),
  z.object({ action: z.literal("cancel") }),
]);

/** The practitioner's next move on a session request (applications.decide, checked on the server). */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => practitionerAct(s, org, id, b), { schema: Body, write: true });
}
