import { NextResponse } from "next/server";
import { withHelper } from "@/server/jobsApply/helperRoute";
import { parse, send } from "@/server/jobsApply/http";
import { FillPlanSchema } from "@/server/jobsApply/schemas";
import { helperFillPlan } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/** POST { host, clicked, fieldIds? } → the values the helper may put in the page, after the §66 fill gate. */
export async function POST(req: Request) {
  return withHelper(req, async (ctx) => {
    const body = await parse(req, FillPlanSchema, 20_000);
    if (body instanceof NextResponse) return body;
    return send(await helperFillPlan(ctx, body));
  });
}
