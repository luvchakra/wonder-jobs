import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { resumeFileStore } from "@/server/resume/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^rf_[A-Za-z0-9_-]{8,40}$/.test(id);

/** Download one of your own files, byte for byte. Always an attachment, never rendered in the page. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!validId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = rateLimit(`resume-file-get:${session.tenantId}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const f = await resumeFileStore().read(session.tenantId, id);
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.meta.mime,
        // Header values must be Latin-1: an ASCII fallback name, and the real one in RFC 5987 form.
        "content-disposition": `attachment; filename="${f.meta.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(f.meta.filename)}`,
        "content-length": String(f.bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[resume-files] read failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be read just now." }, { status: 503 });
  }
}

/** Delete one of your files. Immediate and audited. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!validId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const removed = await resumeFileStore().remove(session.tenantId, id);
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await recordServerAudit(session.tenantId, { actionId: `resume-file:${id}`, actionType: "resume_file", event: "deleted" });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("[resume-files] delete failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be deleted just now. Try again in a minute." }, { status: 503 });
  }
}
