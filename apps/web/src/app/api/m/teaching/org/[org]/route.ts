import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgTeachingApplications, orgTeachingRoles, saveTeachingRole, setTeachingRoleStatus } from "@/server/teaching/applications";
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
  subject: z.string().max(80),
  grades: z.array(z.string().max(40)).max(8),
  board: z.string().max(40),
  schoolType: z.string().max(40),
  payMin: z.number().int().min(1).max(10_000_000),
  payMax: z.number().int().min(1).max(10_000_000).optional(),
  currency: z.string().length(3),
  schedule: z.enum(["part_time", "full_time"]),
  requires: z.array(z.string().max(20)).max(8).optional(),
});

/** The workspace's teaching roles, and its applications when the caller's role may view them. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const roles = await orgTeachingRoles(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { roles, applications: can(role, "applications.view") ? await orgTeachingApplications(s, org) : [], role };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveTeachingRole(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveTeachingRole(s, org, b.posting, b.id) : b.status ? setTeachingRoleStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
