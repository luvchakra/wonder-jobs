import { NextResponse } from "next/server";
import { requireApiCaller } from "@/server/jobslake/access";
import { send } from "@/server/jobslake/http";
import { err, getOpportunity } from "@/server/jobslake/service";
import { isModuleId } from "@/modules/registry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/jobs-lake/v1/opportunities/:id — by WorksLake id (opp_…) or WonderJobs job id. `?module=` reads that module's dataset (default jobs). */
export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireApiCaller(req);
  if (caller instanceof NextResponse) return caller;
  const dataset = new URL(req.url).searchParams.get("module") ?? "jobs";
  if (!isModuleId(dataset)) return send(err(400, "INVALID_REQUEST", "Unknown module."));
  return send(await getOpportunity(decodeURIComponent((await ctx.params).id), caller, dataset));
}
