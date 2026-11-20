import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError, talentPhoto } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; tenant: string }> };

/** A job seeker's photo, for a workspace member who may search talent, only while the seeker chose to show it. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { org, tenant } = await ctx.params;
  try {
    const p = await talentPhoto(session, org, tenant);
    return new NextResponse(new Uint8Array(p.bytes), {
      headers: { "content-type": p.type, "cache-control": "private, max-age=300", vary: "Cookie", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
    });
  } catch (e) {
    if (e instanceof HiringError) return new NextResponse(null, { status: e.status, headers: { "cache-control": "private, no-store" } });
    console.error("[hiring] talent photo read failed:", e instanceof Error ? e.message : "unknown");
    return new NextResponse(null, { status: 503 });
  }
}
