import { NextResponse } from "next/server";
import { withHelper } from "@/server/jobsApply/helperRoute";
import { parse, send } from "@/server/jobsApply/http";
import { FormSchema } from "@/server/jobsApply/schemas";
import { helperInspect } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/**
 * POST { form } → the helper read the page's structure (labels, types, options — never values).
 * The server classifies and maps it; under an "automatic" fill policy the fill plan comes back too.
 */
export async function POST(req: Request) {
  return withHelper(req, async (ctx) => {
    const body = await parse(req, FormSchema, 400_000);
    if (body instanceof NextResponse) return body;
    return send(await helperInspect(ctx, body));
  });
}
