import { inflate, MAX_INFLATED_TOTAL_BYTES, readZipEntries } from "./extractText";

/**
 * What an uploaded résumé file may be. It is sent to employers exactly as uploaded, so it is checked by
 * its bytes, not its name: a real PDF or a real Word (.docx) document, with nothing in it that could act
 * on someone else's machine.
 */
export const MAX_RESUME_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_RESUME_FILES = 5;

export const RESUME_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type ResumeFileMime = (typeof RESUME_MIME)[keyof typeof RESUME_MIME];

export type FileCheck = { ok: true; mime: ResumeFileMime; ext: "pdf" | "docx" } | { ok: false; reason: string };

/** PDF features that can run code, open other files or carry other files. A résumé needs none of them. */
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|OpenAction\s*<<[^>]*\/S\s*\/JavaScript)\b/;

export function checkResumeFile(bytes: Buffer): FileCheck {
  if (bytes.length === 0) return { ok: false, reason: "That file is empty." };
  if (bytes.length > MAX_RESUME_FILE_BYTES) return { ok: false, reason: "That file is over 3 MB. Export a smaller PDF (most résumés are under 1 MB)." };
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    const raw = bytes.toString("latin1");
    if (/\/Encrypt\b/.test(raw)) return { ok: false, reason: "That PDF is password-protected. Save an unprotected copy and upload that." };
    const objects = pdfObjectStreams(bytes, raw);
    if (objects === null) return { ok: false, reason: "That PDF couldn't be checked. Export it again as a plain PDF and upload that." };
    if (ACTIVE_PDF.test(raw) || objects.some((o) => ACTIVE_PDF.test(o))) return { ok: false, reason: "That PDF contains scripts or embedded files. Export it again as a plain PDF and upload that." };
    return { ok: true, mime: RESUME_MIME.pdf, ext: "pdf" };
  }
  if (bytes.readUInt32LE(0) === 0x04034b50) {
    let names: string[];
    try {
      names = readZipEntries(bytes).map((e) => e.name);
    } catch {
      return { ok: false, reason: "That Word file looks damaged. Save it again, or upload a PDF." };
    }
    if (!names.includes("word/document.xml") || !names.includes("[Content_Types].xml")) return { ok: false, reason: "That isn't a Word (.docx) document. Upload a PDF or a .docx file." };
    if (names.some((n) => /vbaProject\.bin$|activeX|\.bin$/i.test(n))) return { ok: false, reason: "That Word file contains macros or embedded programs. Save it as a plain .docx (or PDF) and upload that." };
    return { ok: true, mime: RESUME_MIME.docx, ext: "docx" };
  }
  return { ok: false, reason: "Upload a PDF or a Word (.docx) file." };
}

/**
 * PDF 1.5+ can keep objects — a /JavaScript action included — inside compressed object streams, where
 * a scan of the raw bytes can't see them. Returns each object stream's decompressed text, or null when
 * one can't be read (an unknown filter, a damaged stream, or past the decompression budget): a file
 * that can't be checked isn't accepted.
 */
function pdfObjectStreams(bytes: Buffer, raw: string): string[] | null {
  const out: string[] = [];
  let total = 0;
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf("endstream", m.index);
    if (end < 0) break;
    re.lastIndex = end + "endstream".length;
    const dictStart = raw.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : "";
    if (!/\/Type\s*\/ObjStm\b/.test(dict)) continue;
    const slice = bytes.subarray(m.index + m[0].length, end);
    const filters = [...dict.matchAll(/\/(\w+Decode)\b/g)].map((f) => f[1]);
    if (filters.some((f) => f !== "FlateDecode")) return null;
    try {
      const body = filters.length ? inflate(slice) : slice;
      total += body.length;
      if (total > MAX_INFLATED_TOTAL_BYTES) return null;
      out.push(body.toString("latin1"));
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * A file name safe to show and to hand to an employer's form: letters (incl. accented), digits, spaces
 * and a few punctuation marks, with the extension the bytes actually have.
 */
export function safeResumeFilename(name: string, ext: "pdf" | "docx"): string {
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFC")
    .replace(/[^\w .()\-–—À-ž]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${base || "Resume"}.${ext}`;
}
