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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
