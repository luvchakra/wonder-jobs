import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { applicationHistory, decide, listApplications } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

/** The workspace's applications; ?history=<id> returns one application's history instead. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const history = new URL(req.url).searchParams.get("history");
  return hiringRoute(req, async (s) => (history ? { events: await applicationHistory(s, org, history) } : { applications: await listApplications(s, org) }));
}

/** { id, status, note?, link? } moves an application on and emails the applicant. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({
    id: z.string().min(1).max(80),
    status: z.enum(["reviewing", "interview", "offer", "hired", "rejected"]),
    note: z.string().max(2000).optional(),
    link: z.string().max(500).optional(),
  });
  return hiringRoute(req, (s, b) => decide(s, org, b.id, b), { schema: Body, write: true });
}
