import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { deleteListing } from "@/server/moderation";
import { isModuleId } from "@/modules/registry";

export const runtime = "nodejs";

/**
 * Delete your own WonderWorks post (owner, 2026-11-03): a team member who may edit the organisation's posts, or the
 * seller of a marketplace listing. Its applications, requests and conversations go with it. Audited.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ module: string; id: string }> }) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { module, id } = await ctx.params;
  if (!isModuleId(module)) return NextResponse.json({ error: "Unknown module." }, { status: 404 });
  try {
    await deleteListing({ session: s }, module, decodeURIComponent(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Couldn't delete it." : (e as Error).message }, { status });
  }
}
