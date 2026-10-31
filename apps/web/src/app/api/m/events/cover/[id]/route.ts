import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { readCover } from "@/server/events/covers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * An event's cover photo, only through its event: anyone signed in while it is open, else its workspace's members and
 * attendees. The address carries the cover's version (?v=), so a given address never changes and may be kept by the browser.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { id } = await ctx.params;
  const c = await readCover(s, id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(c.bytes), { headers: { "content-type": c.mime, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
