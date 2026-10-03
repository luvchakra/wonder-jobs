/**
 * A résumé file the candidate uploaded — their own PDF or Word document, attached to applications
 * exactly as uploaded. Only metadata reaches the browser; the bytes stay encrypted on the server.
 */
export interface UploadedResume {
  id: string;
  filename: string;
  mime: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}

/** Which résumé is the candidate's default: one of their uploaded files, or a résumé generated from a template. */
export type BaseResumeRef = { kind: "upload"; id: string } | { kind: "saved"; id: string };

export const isPdf = (f: Pick<UploadedResume, "mime">) => f.mime === "application/pdf";

/**
 * The name an employer sees on the file: what the candidate typed, made safe for every upload form and
 * download — no path or reserved characters, at most 100 characters, and always the file's real extension
 * (a PDF stays ".pdf" whatever is typed). Null when nothing usable is left.
 */
export function cleanResumeFilename(input: string, ext: "pdf" | "docx"): string | null {
  const base = input
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\.(pdf|docx?)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 100)
    .trim();
  return base ? `${base}.${ext}` : null;
}

/**
 * A name for a résumé Wonder renders (a template résumé): `cleanResumeFilename`, kept to the characters an
 * Application Pack accepts (`server/jobsApply/schemas.ts`), so the name the candidate sees is the name the
 * employer gets. Returned without the extension; null when nothing usable is left.
 */
export function cleanGeneratedResumeName(input: string): string | null {
  const clean = cleanResumeFilename(input.replace(/[^\w .()\-–—À-ž]+/g, " "), "pdf");
  return clean ? clean.slice(0, -4) : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
