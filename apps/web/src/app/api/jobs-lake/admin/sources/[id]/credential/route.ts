import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { removeSourceCredential, setSourceCredential } from "@/server/jobslake/admin";
import { badJson, readJson, send } from "@/server/jobslake/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Set or replace a source's credential. Write-only: the response carries only the masked status. */
export async function PUT(req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 8_000)) as { secret?: unknown } | null;
  if (body === null) return badJson();
  return send(await setSourceCredential((await ctx.params).id, body.secret, a.actor));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return send(await removeSourceCredential((await ctx.params).id, a.actor));
}
