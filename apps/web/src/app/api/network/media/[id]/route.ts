import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { readMedia } from "@/server/network/engage";
import { discardMedia } from "@/server/network/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A post's photo, only for someone who may see the post (a photo not yet posted, only for the member who chose it). Never cached publicly. */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const p = await readMedia(s, id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(p.bytes), { headers: { "content-type": p.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}

/** Take back a photo the caller chose but hasn't posted. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  await discardMedia(s, id);
  return NextResponse.json({ ok: true });
}
