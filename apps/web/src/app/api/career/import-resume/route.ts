import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { extractResumeText, UnsupportedResumeError } from "@/server/resume/extractText";
import { parseResume } from "@/server/resume/parseResume";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 200_000;

/**
 * Reads a resume and suggests Career DNA from it.
 *
 * Nothing is saved here: the route returns a draft and the browser shows it field by field for the
 * candidate to accept, edit or ignore. The resume itself is read in memory and never stored — Wonder
 * has no reason to keep it, and the candidate hasn't asked it to.
 *
 * Send either `multipart/form-data` with a `file`, or JSON `{ text }` for a pasted resume.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`resume:${session.tenantId}`, { capacity: 10, refillPerSec: 1 / 30 });
  if (!rl.ok) return NextResponse.json({ error: "That's a lot of resumes at once. Give it a minute." }, { status: 429 });

  let text: string;
  let format = "text";
  let readable = true;
  let filename: string | undefined;

  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Attach a resume file, or paste the text instead." }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 5 MB. Export a smaller PDF, or paste the text instead." }, { status: 413 });
      if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
      filename = file.name;
      const extracted = extractResumeText(Buffer.from(await file.arrayBuffer()), file.name);
      text = extracted.text;
      format = extracted.format;
      readable = extracted.readable;
    } else {
      const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
      if (typeof body?.text !== "string" || body.text.trim().length < 80) {
        return NextResponse.json({ error: "Paste a bit more of your resume — at least a few lines." }, { status: 400 });
      }
      text = body.text.slice(0, MAX_TEXT);
    }
  } catch (e) {
    if (e instanceof UnsupportedResumeError) return NextResponse.json({ error: e.message }, { status: 415 });
    return NextResponse.json({ error: "That file couldn't be read. Try a PDF or DOCX, or paste the text instead." }, { status: 400 });
  }

  if (!readable) {
    return NextResponse.json(
      {
        error:
          format === "pdf"
            ? "Wonder couldn't find any text in that PDF — it's probably a scan or an image. Copy the text from your resume and paste it instead."
            : "There wasn't enough readable text in that file. Paste your resume text instead.",
        format,
      },
      { status: 422 },
    );
  }

  const draft = parseResume(text.slice(0, MAX_TEXT));
  const filled = Object.keys(draft.evidence).length;
  if (!filled) {
    return NextResponse.json({ error: "Wonder couldn't recognise anything to fill in from that. Check it's the right file, or fill your Career Profile in directly." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, format, filename, draft, characters: text.length }, { headers: { "cache-control": "no-store" } });
}
