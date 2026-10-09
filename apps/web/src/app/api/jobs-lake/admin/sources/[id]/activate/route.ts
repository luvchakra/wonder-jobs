import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { activateSource } from "@/server/jobslake/admin";
import { healthBySource } from "@/server/jobslake/core";
import { json, readJson, send } from "@/server/jobslake/http";
import { sourceView } from "@/server/jobslake/views";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Activate (or resume) a source. Requires a passing test within 24 hours; never for scrapers. A
 * partner portal also needs its connection and credential, and `{ agreementConfirmed: true }` —
 * the admin's statement that a signed agreement permits this use (recorded with who and when).
 */
export async function POST(req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 4_000)) ?? {};
  const r = await activateSource((await ctx.params).id, a.actor, body);
  if (!r.ok) return send(r);
  return json({ source: await sourceView(r.value, await healthBySource()) });
}
