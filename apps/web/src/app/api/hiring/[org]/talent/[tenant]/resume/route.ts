import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError, talentResume } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; tenant: string }> };

/**
 * The résumé a job seeker chose to share with recruiters, for a workspace member who may search talent. A PDF opens in
 * the browser (sandboxed); a Word file downloads.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { org, tenant } = await ctx.params;
  try {
    const f = await talentResume(session, org, tenant);
    const how = f.mime === "application/pdf" ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `${how}; filename="${f.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        "content-length": String(f.bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
      },
    });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[hiring] talent résumé read failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be read just now." }, { status: 503 });
  }
}
