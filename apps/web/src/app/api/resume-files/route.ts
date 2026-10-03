import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { resumeFileStore } from "@/server/resume/files";
import { MAX_RESUME_FILES, MAX_RESUME_FILE_BYTES, checkResumeFile, safeResumeFilename } from "@/server/resume/fileValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The candidate's uploaded résumé files (metadata only — never the bytes). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ files: await resumeFileStore().list(session.tenantId), limits: { maxFiles: MAX_RESUME_FILES, maxBytes: MAX_RESUME_FILE_BYTES } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[resume-files] list failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Your résumé files couldn't be loaded just now." }, { status: 503 });
  }
}

/** Upload one résumé (multipart `file`): checked by its bytes, encrypted, stored, audited. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`resume-files:${session.tenantId}`, { capacity: 10, refillPerSec: 1 / 360 });
  if (!rl.ok) return NextResponse.json({ error: "That's a lot of uploads at once. Try again in a few minutes." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_RESUME_FILE_BYTES + 64 * 1024) return NextResponse.json({ error: "That file is over 3 MB. Export a smaller PDF (most résumés are under 1 MB)." }, { status: 413 });
  let file: File;
  try {
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "Choose a PDF or Word file to upload." }, { status: 400 });
    file = f;
  } catch {
    return NextResponse.json({ error: "Choose a PDF or Word file to upload." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = checkResumeFile(bytes);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 415 });
  try {
    const store = resumeFileStore();
    if ((await store.list(session.tenantId)).length >= MAX_RESUME_FILES) return NextResponse.json({ error: `You can keep up to ${MAX_RESUME_FILES} résumé files. Delete one to upload another.` }, { status: 409 });
    const meta = await store.save(session.tenantId, { filename: safeResumeFilename(file.name, check.ext), mime: check.mime, bytes });
    await recordServerAudit(session.tenantId, { actionId: `resume-file:${meta.id}`, actionType: "resume_file", event: "uploaded", detail: `${meta.sizeBytes} bytes · sha256 ${meta.sha256.slice(0, 16)}` });
    return NextResponse.json({ file: meta }, { status: 201 });
  } catch (e) {
    console.error("[resume-files] upload failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Your file couldn't be saved just now. Try again in a minute." }, { status: 503 });
  }
}
