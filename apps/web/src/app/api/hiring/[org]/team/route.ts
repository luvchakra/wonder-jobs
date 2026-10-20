import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { cancelInvite, inviteMember, listTeam, removeMember, setMemberRole } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };
const Role = z.enum(["owner", "hiring_manager", "recruiter"]);

export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s) => listTeam(s, org));
}

export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => inviteMember(s, org, b.email, b.role), { schema: z.object({ email: z.string().trim().max(254), role: Role }), write: true });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => setMemberRole(s, org, b.tenantId, b.role), { schema: z.object({ tenantId: z.string().min(1).max(120), role: Role }), write: true });
}

/** ?tenant=… removes a member (or leaves, for oneself); ?invite=… withdraws an invitation. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const u = new URL(req.url);
  const tenant = u.searchParams.get("tenant");
  const invite = u.searchParams.get("invite");
  return hiringRoute(req, (s) => (tenant ? removeMember(s, org, tenant) : invite ? cancelInvite(s, org, invite) : Promise.resolve({ ok: false })), { write: true });
}
