import { NextResponse } from "next/server";
import { fail, parse, send, webTenant } from "@/server/jobsApply/http";
import { InterventionSchema } from "@/server/jobsApply/schemas";
import { resolve } from "@/server/jobsApply/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** POST → resolve one "Needs you" item: approve/edit a value, choose a document field, skip, or mark answered on the portal (§51–§52). */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id, itemId } = await ctx.params;
  const body = await parse(req, InterventionSchema, 20_000);
  if (body instanceof NextResponse) return body;
  try {
    return send(await resolve(t, id, itemId, body));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't save the answer.");
  }
}
