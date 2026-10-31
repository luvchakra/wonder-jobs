import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgEvents, saveEvent, setEventStatus } from "@/server/events/listings";
import { announceChange, announcePromoted, orgRsvps } from "@/server/events/rsvp";
import { membershipOf } from "@/server/hiring";
import { can } from "@/domain/org/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const Posting = z.object({
  title: z.string().max(160),
  description: z.string().max(8000),
  location: z.string().max(160).optional(),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40).optional(),
  capacity: z.number().int().min(1).max(10_000).optional(),
  online: z.boolean().optional(),
  ageMin: z.number().int().min(1).max(99).optional(),
  tags: z.array(z.string().max(30)).max(5).optional(),
  price: z.number().min(0).max(0).optional(),
});

/** The workspace's events, its RSVPs when the caller's role may view them, and that role. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const events = await orgEvents(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { events, rsvps: can(role, "applications.view") ? await orgRsvps(s, org) : [], role };
  });
}

/** Post an event (a draft until opened). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s, b) => (await saveEvent(s, org, b)).posting, { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it (a raised capacity moves the waitlist up); { id, tell } tells the people on it it changed. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional(), tell: z.boolean().optional() });
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.posting) {
        const out = await saveEvent(s, org, b.posting, b.id);
        await announcePromoted(out.promoted, "a capacity change");
        return { posting: out.posting, ...(b.tell ? await announceChange(s, org, b.id) : {}) };
      }
      if (b.tell) return announceChange(s, org, b.id);
      return b.status ? setEventStatus(s, org, b.id, b.status) : { ok: false };
    },
    { schema: Body, write: true },
  );
}
