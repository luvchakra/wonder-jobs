import { NextResponse } from "next/server";
import { communityPhoto } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A public community's photo, for its shared page (owner, 2026-11-23); a private one's is never shown off the network. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const p = await communityPhoto(id, true).catch(() => null);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(p.bytes), { headers: { "content-type": p.mime, "cache-control": "public, max-age=3600, s-maxage=86400", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
