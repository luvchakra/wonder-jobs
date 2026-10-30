import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgTherapists, saveTherapist, setTherapistStatus } from "@/server/therapists/listings";
import { membershipOf } from "@/server/hiring";
import { orgSessions } from "@/server/therapists/sessions";
import { can } from "@/domain/org/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const Posting = z.object({
  title: z.string().max(160),
  description: z.string().max(8000),
  modes: z.array(z.enum(["online", "in_person"])).max(2),
  city: z.string().max(120).optional(),
  languages: z.array(z.string().max(30)).max(11),
  focus: z.array(z.string().max(40)).max(12),
  approaches: z.array(z.string().max(40)).max(8).optional(),
  feeMin: z.number().int().min(0).max(1_000_000),
  feeMax: z.number().int().min(0).max(1_000_000).optional(),
  currency: z.string().length(3).optional(),
  sessionMinutes: z.number().int().min(10).max(300).optional(),
});

/** The workspace's practitioner listings, its session requests when the caller's role may view them, and that role. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const listings = await orgTherapists(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { listings, sessions: can(role, "applications.view") ? await orgSessions(s, org) : [], role };
  });
}

/** List yourself (a draft until opened). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveTherapist(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveTherapist(s, org, b.posting, b.id) : b.status ? setTherapistStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
