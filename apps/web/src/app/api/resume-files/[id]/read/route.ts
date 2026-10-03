import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { resumeFileStore } from "@/server/resume/files";
import { extractResumeText, UnsupportedResumeError } from "@/server/resume/extractText";
import { readResumeProposal } from "@/server/resume/readResume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read one of the candidate's own stored résumé files and propose Career Profile entries from it.
 * Nothing is written: the reply is a proposal (and the résumé's text, so the candidate's own AI model
 * can read it too if they ask) for them to review entry by entry.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!/^rf_[A-Za-z0-9_-]{8,40}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = rateLimit(`resume:${session.tenantId}`, { capacity: 10, refillPerSec: 1 / 30 });
  if (!rl.ok) return NextResponse.json({ error: "That's a lot of résumés at once. Give it a minute." }, { status: 429 });
  let file;
  try {
    file = await resumeFileStore().read(session.tenantId, id);
  } catch (e) {
    console.error("[resume-files] read failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "That file couldn't be read just now." }, { status: 503 });
  }
  if (!file) return NextResponse.json({ error: "That file was deleted. Choose another résumé." }, { status: 404 });
  try {
    const extracted = extractResumeText(file.bytes, file.meta.filename);
    const result = readResumeProposal(extracted.text, extracted.format, extracted.readable);
    if (!result.ok) return NextResponse.json({ error: result.error, format: extracted.format }, { status: 422 });
    return NextResponse.json({ ...result.body, filename: file.meta.filename }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof UnsupportedResumeError) return NextResponse.json({ error: e.message }, { status: 415 });
    return NextResponse.json({ error: "Wonder couldn't read that file. Try Import from resume with a pasted copy instead." }, { status: 422 });
  }
}
