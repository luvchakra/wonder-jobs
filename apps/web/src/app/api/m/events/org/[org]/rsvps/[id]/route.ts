import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { markAttendee } from "@/server/events/rsvp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ action: z.enum(["attended", "no_show", "cancelled"]) });

/** The organiser removes an attendee before the event, or marks attended / no-show after it (applications.decide, checked on the server). */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => markAttendee(s, org, id, b.action), { schema: Body, write: true });
}
