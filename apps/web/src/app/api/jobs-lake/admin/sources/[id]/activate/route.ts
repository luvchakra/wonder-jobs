import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { activateSource } from "@/server/jobslake/admin";
import { healthBySource } from "@/server/jobslake/core";
import { json, send } from "@/server/jobslake/http";
import { sourceView } from "@/server/jobslake/views";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Activate (or resume) a source. Requires a passing test within 24 hours; never for partnership or scraper sources. */
export async function POST(_req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const r = await activateSource((await ctx.params).id, a.actor);
  if (!r.ok) return send(r);
  return json({ source: await sourceView(r.value, await healthBySource()) });
}
