import { NextResponse } from "next/server";
import { requireAdminOrService } from "@/server/jobslake/access";
import { send } from "@/server/jobslake/http";
import { getSourcePublic } from "@/server/jobslake/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const caller = await requireAdminOrService(req);
  if (caller instanceof NextResponse) return caller;
  return send(await getSourcePublic((await ctx.params).id));
}
