import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { decideApplication } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ status: z.enum(["shortlisted", "appointed", "closed"]) });

/** Move a teaching application on (applications.decide); the teacher hears it in the app. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => decideApplication(s, org, id, b.status), { schema: Body, write: true });
}
