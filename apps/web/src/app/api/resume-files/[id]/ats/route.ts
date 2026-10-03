import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { resumeFileStore } from "@/server/resume/files";
import { UnsupportedResumeError } from "@/server/resume/extractText";
import { checkResumeAts } from "@/server/resume/atsCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** ATS readiness for one of the candidate's own stored résumé files. Read-only: the report is returned, nothing is kept. */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!/^rf_[A-Za-z0-9_-]{8,40}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = rateLimit(`resume-ats:${session.tenantId}`, { capacity: 20, refillPerSec: 1 / 15 });
  if (!rl.ok) return NextResponse.json({ error: "That's a lot of checks at once. Give it a minute." }, { status: 429 });
  let file;
  try {
    file = await resumeFileStore().read(session.tenantId, id);
  } catch (e) {
    console.error("[resume-files] ats read failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be read just now." }, { status: 503 });
  }
  if (!file) return NextResponse.json({ error: "That file was deleted." }, { status: 404 });
  try {
    return NextResponse.json({ report: checkResumeAts(file.bytes, file.meta.filename, file.meta.sha256) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof UnsupportedResumeError) return NextResponse.json({ error: e.message }, { status: 415 });
    console.error("[resume-files] ats check failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Wonder couldn't check that file." }, { status: 422 });
  }
}
