import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { recordServerAudit } from "@/server/audit";
import { revokeApiKey } from "@/server/jobslake/developer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "cache-control": "no-store" };

/** DELETE /api/jobs-lake/keys/:id — revoke one of the signed-in account's own keys. Another account's key is "not found". */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const id = (await ctx.params).id;
  try {
    if (!(await revokeApiKey(session.tenantId, id))) return NextResponse.json({ error: "No such active key." }, { status: 404, headers: NO_STORE });
  } catch (e) {
    console.error(`[jobslake-api] revoke failed: ${e instanceof Error ? e.message : "unknown"}`);
    return NextResponse.json({ error: "The key couldn't be revoked just now. Try again shortly." }, { status: 503, headers: NO_STORE });
  }
  await recordServerAudit(session.tenantId, { actionId: `jlapi-key:${id}`, actionType: "jobslake_api", event: "key_revoked" });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
