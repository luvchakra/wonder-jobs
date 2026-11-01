import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { decideScholarship } from "@/server/scholarships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ status: z.enum(["shortlisted", "accepted", "done", "declined"]) });

/** Move an application on (applications.decide); the student hears it in the app. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => decideScholarship(s, org, id, b.status), { schema: Body, write: true });
}
