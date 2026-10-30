import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { mySessions, requestSession } from "@/server/therapists/sessions";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  listingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  request: z.object({ mode: z.enum(["online", "in_person"]), date: z.string().max(10), slot: z.enum(["morning", "afternoon", "evening"]), phone: z.string().max(20).optional() }),
  confirmed: z.boolean().optional(),
});

/** The client's own session requests and sessions. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ sessions: await mySessions(s) }));
}

/** Request a session with a practitioner who lists on WonderWorks: the client's own press (therapists.book, checked on the server), audited. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await requestSession(s, b);
      // The audit names the request, not the practitioner: it's a record of the action, not of who the client sees.
      await recordServerAudit(s.tenantId, { actionId: `therapists-session:${out.id}`, actionType: "therapists.book", event: "SESSION_REQUESTED" });
      after(out.notify);
      return { id: out.id };
    },
    { schema: Body, write: true },
  );
}
