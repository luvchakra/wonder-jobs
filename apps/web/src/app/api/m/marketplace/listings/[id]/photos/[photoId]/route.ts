import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { readPhoto, removePhoto } from "@/server/marketplace/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; photoId: string }> };

/** A photo, only through its listing: the seller's own always, anyone signed in only while the listing is open. Never cached publicly. */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id, photoId } = await ctx.params;
  const p = await readPhoto(s, id, photoId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(p.bytes), { headers: { "content-type": p.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}

/** The seller removes one of their own photos. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id, photoId } = await ctx.params;
  try {
    await removePhoto(s, id, photoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
