import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myRsvps, rsvp } from "@/server/events/rsvp";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ listingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/), name: z.string().max(200), confirmed: z.boolean().optional() });

/** The person's own RSVPs. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ rsvps: await myRsvps(s) }));
}

/** RSVP to an open event: the person's own press (events.rsvp, and events.promote for a waitlist, checked on the server), audited once. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await rsvp(s, b);
      if (!out.repeated) await recordServerAudit(s.tenantId, { actionId: `events-rsvp:${out.id}`, actionType: "events.rsvp", event: out.status === "going" ? "RSVP_GOING" : "RSVP_WAITLISTED" });
      return { id: out.id, status: out.status, repeated: out.repeated, ...(out.place ? { place: out.place } : {}) };
    },
    { schema: Body, write: true },
  );
}
