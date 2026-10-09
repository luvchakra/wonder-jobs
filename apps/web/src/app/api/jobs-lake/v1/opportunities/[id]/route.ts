import { NextResponse } from "next/server";
import { requireApiCaller } from "@/server/jobslake/access";
import { send } from "@/server/jobslake/http";
import { getOpportunity } from "@/server/jobslake/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/jobs-lake/v1/opportunities/:id — by JobsLake id (opp_…) or WonderJobs job id. */
export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireApiCaller(req);
  if (caller instanceof NextResponse) return caller;
  return send(await getOpportunity(decodeURIComponent((await ctx.params).id), caller));
}
