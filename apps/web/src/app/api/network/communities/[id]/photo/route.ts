import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { rateLimit } from "@/server/rateLimit";
import { memberCommunityPhoto, removeCommunityPhoto, setCommunityPhoto } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) => {
  if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[community photo]", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
};

/** The community's photo, for anyone on the network (its address changes with it, so it keeps for a day). */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  try {
    const p = await memberCommunityPhoto(s, id);
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(p.bytes), { headers: { "content-type": p.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
  } catch (e) {
    return fail(e);
  }
}

/** A new photo (multipart "file"): the owner, or a moderator with Settings. */
export async function POST(req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  if (!rateLimit(`community-photo:${s.tenantId}`, { capacity: 6, refillPerSec: 0.1 }).ok) return NextResponse.json({ error: "Too many photos at once. Wait a moment." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > 1024 * 1024 + 64 * 1024) return NextResponse.json({ error: "That photo is too big." }, { status: 413 });
  const { id } = await ctx.params;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    return NextResponse.json({ community: await setCommunityPhoto(s, id, Buffer.from(await file.arrayBuffer()), file.type) });
  } catch (e) {
    return fail(e);
  }
}

/** Remove the photo: the letter mark shows again. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ community: await removeCommunityPhoto(s, id) });
  } catch (e) {
    return fail(e);
  }
}
