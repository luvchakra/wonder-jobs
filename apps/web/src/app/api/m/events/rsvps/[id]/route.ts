import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { cancelMyRsvp } from "@/server/events/rsvp";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.literal("cancel"), confirmed: z.boolean().optional() });

/** The person cancels their RSVP or leaves the waitlist, until the event starts (events.cancel, checked on the server), audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await cancelMyRsvp(s, id, b.confirmed);
      await recordServerAudit(s.tenantId, { actionId: `events-cancel:${id}`, actionType: "events.cancel", event: "RSVP_CANCELLED" });
      return { status: out.status };
    },
    { schema: Body, write: true },
  );
}
