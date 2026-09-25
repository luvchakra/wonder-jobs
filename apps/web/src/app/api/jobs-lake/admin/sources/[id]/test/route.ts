import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { testSourceById } from "@/server/jobslake/admin";
import { send } from "@/server/jobslake/http";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return send(await testSourceById((await ctx.params).id, a.actor));
}
