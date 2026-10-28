import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { addReview, applicationHistory, decide, listApplications, listReviews } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

/** The workspace's applications; ?history=<id> returns one application's history, ?reviews=<id> its scorecards and notes. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const history = q.get("history");
  const reviews = q.get("reviews");
  return hiringRoute(req, async (s) => (history ? { events: await applicationHistory(s, org, history) } : reviews ? { reviews: await listReviews(s, org, reviews) } : { applications: await listApplications(s, org) }));
}

/** { id, recommendation?, note? } adds the caller's scorecard or note to an application (the team's own). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), recommendation: z.enum(["strong_no", "no", "yes", "strong_yes"]).optional(), note: z.string().max(2000).optional() });
  return hiringRoute(req, async (s, b) => ({ review: await addReview(s, org, b.id, b) }), { schema: Body, write: true });
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
