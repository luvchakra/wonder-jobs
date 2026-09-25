import { NextResponse } from "next/server";
import { send, webTenant } from "@/server/jobsApply/http";
import { get } from "@/server/jobsApply/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET → one session (tenant-checked), its progress and the effective automation decisions. */
export async function GET(req: Request, ctx: Ctx) {
  const t = await webTenant(req, false);
  if (t instanceof NextResponse) return t;
  const { id } = await ctx.params;
  return send(await get(t, id));
}
