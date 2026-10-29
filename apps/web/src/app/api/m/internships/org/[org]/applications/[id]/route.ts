import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { decideInternship } from "@/server/internships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

const Body = z.object({ status: z.enum(["shortlisted", "offer", "closed"]) });

/** Move an internship application on (applications.decide); the student hears it in the app. */
export async function POST(req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return hiringRoute(req, (s, b) => decideInternship(s, org, id, b.status), { schema: Body, write: true });
}
