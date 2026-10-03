import { isPdf, type BaseResumeRef, type UploadedResume } from "@/domain/resume/files";
import type { SavedResume } from "@/domain/resume/saved";
import { getTemplate } from "@/domain/resume/templates";

export type ResumeOption = { key: string; label: string; detail: string; kind: "tailored" | "saved" | "upload"; saved?: SavedResume; upload?: UploadedResume };

/**
 * The résumés offered for this job, in order: one generated for this job, then the candidate's base
 * résumé (whichever they marked — never one picked for them), then their uploaded files, other generated
 * résumés and the Application Pack's tailored draft. The first option is preselected.
 */
export function resumeOptionsFor(input: { jobId: string; hasTailored: boolean; tailoredSource?: string; saved: SavedResume[]; uploads?: UploadedResume[]; base?: BaseResumeRef; /** When the base comes from the role whose search found this job. */ baseRoleTitle?: string }): ResumeOption[] {
  const baseName = input.baseRoleTitle ? `Your ${input.baseRoleTitle} résumé` : "Your base résumé";
  const uploads = input.uploads ?? [];
  const isBaseSaved = (s: SavedResume) => input.base?.kind === "saved" && input.base.id === s.id;
  const isBaseUpload = (u: UploadedResume) => input.base?.kind === "upload" && input.base.id === u.id;
  const savedOption = (s: SavedResume): ResumeOption => {
    const t = getTemplate(s.templateId);
    const base = isBaseSaved(s);
    return { key: `saved:${s.id}`, kind: "saved", saved: s, label: base ? `${baseName} — ${t?.name ?? s.templateId} template (PDF)` : `${t?.name ?? s.templateId} template résumé (PDF)`, detail: `${s.target?.jobId === input.jobId ? "Made for this role · " : ""}From your Career Profile · ${new Date(s.createdAt).toLocaleDateString()} · template v${s.templateVersion}` };
  };
  const uploadOption = (u: UploadedResume): ResumeOption => ({ key: `upload:${u.id}`, kind: "upload", upload: u, label: isBaseUpload(u) ? `${baseName} — ${u.filename}` : u.filename, detail: `Your own file (${isPdf(u) ? "PDF" : "Word"}) · uploaded ${new Date(u.uploadedAt).toLocaleDateString()} · attached exactly as uploaded` });

  const out: ResumeOption[] = [];
  const forJob = input.saved.filter((s) => s.target?.jobId === input.jobId);
  out.push(...forJob.map(savedOption));
  const baseSaved = input.saved.find((s) => isBaseSaved(s) && s.target?.jobId !== input.jobId);
  const baseUpload = uploads.find(isBaseUpload);
  if (baseSaved) out.push(savedOption(baseSaved));
  if (baseUpload) out.push(uploadOption(baseUpload));
  out.push(...uploads.filter((u) => !isBaseUpload(u)).map(uploadOption));
  out.push(...input.saved.filter((s) => s.target?.jobId !== input.jobId && !isBaseSaved(s)).slice(0, 4).map(savedOption));
  if (input.hasTailored) out.push({ key: "tailored", kind: "tailored", label: "Tailored résumé for this role (DOCX)", detail: input.tailoredSource ? `From the Application Pack · ${input.tailoredSource}` : "From the Application Pack" });
  return out;
}
