import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { memberPhoto } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A member's photo, only for a viewer on the network whom their photo setting allows. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    const p = await memberPhoto(session, id);
    return new NextResponse(new Uint8Array(p.bytes), {
      headers: { "content-type": p.type, "cache-control": "private, max-age=300", vary: "Cookie", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
    });
  } catch (e) {
    if (e instanceof HiringError) return new NextResponse(null, { status: e.status, headers: { "cache-control": "private, no-store" } });
    console.error("[network] photo read failed:", e instanceof Error ? e.message : "unknown");
    return new NextResponse(null, { status: 503 });
  }
}
