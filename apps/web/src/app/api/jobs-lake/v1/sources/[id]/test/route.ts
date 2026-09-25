import { NextResponse } from "next/server";
import { requireAdminOrService } from "@/server/jobslake/access";
import { send } from "@/server/jobslake/http";
import { testSourceById } from "@/server/jobslake/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/jobs-lake/v1/sources/:id/test — a real fetch through the source's connector, validated. */
export async function POST(req: Request, ctx: Ctx) {
  const caller = await requireAdminOrService(req);
  if (caller instanceof NextResponse) return caller;
  return send(await testSourceById((await ctx.params).id, caller.kind === "admin" ? caller.actor : "service"));
}
