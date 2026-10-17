import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { recordServerAudit } from "@/server/audit";
import { removeConnection } from "@/server/connections";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE → forget this sign-in: its encrypted password goes with it. The portal account itself stays. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const removed = await removeConnection(session.tenantId, id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordServerAudit(session.tenantId, { actionId: `connection-removed:${id}`, actionType: "portal_connection", event: "portal_connection_removed" });
  return NextResponse.json({ ok: true });
}
