import { NextResponse } from "next/server";
import { fail, send, webTenant } from "@/server/jobsApply/http";
import { fillCloud } from "@/server/jobsApply/cloud";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → the candidate chose Fill. This only tells the helper in the cloud page to ask for its fill plan;
 * the plan itself comes from `/api/jobs-apply/extension/fill-plan`, behind the candidate's automation policy.
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id } = await ctx.params;
  try {
    return send(await fillCloud(t, id));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't reach the cloud browser.");
  }
}
