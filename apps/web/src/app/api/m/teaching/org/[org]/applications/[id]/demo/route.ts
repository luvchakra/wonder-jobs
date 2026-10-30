import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { offerDemo } from "@/server/teaching/bookings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Slot = z.object({ startsAt: z.string().max(40), durationMin: z.number().int(), mode: z.enum(["online", "in_person"]), location: z.string().max(300).optional(), note: z.string().max(500).optional() });
const Body = z.object({ slots: z.array(Slot).min(1).max(5) });

/** The school offers demo-class times on an application (applications.decide); the teacher hears it in the app. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ bookings: await offerDemo(s, org, id, b.slots) }), { schema: Body, write: true });
}
