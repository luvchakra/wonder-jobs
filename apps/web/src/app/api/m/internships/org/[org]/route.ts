import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgInternshipApplications, orgInternships, saveInternship, setInternshipStatus } from "@/server/internships/applications";
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
  skills: z.array(z.string().max(60)).max(25).optional(),
  stipendMin: z.number().int().min(0).max(10_000_000),
  stipendMax: z.number().int().min(0).max(10_000_000).optional(),
  currency: z.string().length(3),
  durationMonths: z.number().int().min(1).max(24),
  startsOn: z.string().max(10),
  applyBy: z.string().max(10),
  schedule: z.enum(["part_time", "full_time"]),
});

/** The workspace's internships, and its internship applications when the caller's role may view them. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const internships = await orgInternships(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { internships, applications: can(role, "applications.view") ? await orgInternshipApplications(s, org) : [], role };
  });
}

/** Post an internship (a draft until opened). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveInternship(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveInternship(s, org, b.posting, b.id) : b.status ? setInternshipStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
