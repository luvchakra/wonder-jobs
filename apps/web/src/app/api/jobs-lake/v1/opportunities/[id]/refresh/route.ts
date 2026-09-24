import { NextResponse } from "next/server";
import { requireCandidateOrService } from "@/server/jobslake/access";
import { send } from "@/server/jobslake/http";
import { refreshOpportunityById } from "@/server/jobslake/service";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/jobs-lake/v1/opportunities/:id/refresh — re-read it from its canonical source. */
export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireCandidateOrService(req);
  if (caller instanceof NextResponse) return caller;
  return send(await refreshOpportunityById(caller, decodeURIComponent((await ctx.params).id)));
}
