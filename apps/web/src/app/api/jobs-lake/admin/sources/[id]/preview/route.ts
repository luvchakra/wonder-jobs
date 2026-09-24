import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { previewSource } from "@/server/jobslake/admin";
import { readJson, send } from "@/server/jobslake/http";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** Fetch a saved source with a proposed mapping and show what it would produce. Stores nothing. */
export async function POST(req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req)) as { mapping?: unknown } | null;
  return send(await previewSource((await ctx.params).id, body?.mapping ?? null, a.actor));
}
