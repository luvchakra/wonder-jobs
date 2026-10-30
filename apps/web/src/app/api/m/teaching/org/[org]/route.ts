import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgApplications, orgOpenings, saveOpening, setOpeningStatus } from "@/server/teaching/applications";
import { orgBookings } from "@/server/teaching/bookings";
import { can } from "@/domain/org/permissions";
import { membershipOf } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const Posting = z.object({
  title: z.string().max(160),
  description: z.string().max(8000),
  location: z.string().max(160),
  workMode: z.enum(["remote", "hybrid", "onsite"]),
  subject: z.string().max(60),
  grades: z.array(z.string().max(20)).max(6),
  boards: z.array(z.string().max(20)).max(5).optional(),
  hours: z.enum(["full_time", "part_time", "tuition"]),
  requires: z.array(z.string().max(40)).max(10).optional(),
  payMin: z.number().int().min(0).max(10_000_000).optional(),
  payMax: z.number().int().min(0).max(10_000_000).optional(),
  currency: z.string().length(3).optional(),
  payPer: z.enum(["month", "hour"]).optional(),
});

/** The workspace's teaching openings, and their applications and demo classes when the caller's role may view them. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const openings = await orgOpenings(s, org);
    const role = (await membershipOf(s, org))?.role;
    const view = can(role, "applications.view");
    const [applications, bookings] = view ? await Promise.all([orgApplications(s, org), orgBookings(s, org)]) : [[], []];
    return { openings, applications, bookings, role };
  });
}

/** Post an opening (a draft until opened). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveOpening(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveOpening(s, org, b.posting, b.id) : b.status ? setOpeningStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
