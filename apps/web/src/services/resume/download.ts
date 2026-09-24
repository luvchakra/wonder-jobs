/**
 * Downloads, in the browser. The PDF is built here from the same layout the preview shows, so the
 * candidate's résumé never has to leave their device to be rendered. `pdf-lib` loads only when a PDF
 * is actually requested.
 */
import type { GeneratedResume } from "./generate";
import { buildResumeDocx } from "./docx";

function save(bytes: Uint8Array<ArrayBuffer>, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function resumeFilename(g: GeneratedResume, ext: "pdf" | "docx") {
  const name = (g.document.header.name || "Resume").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  const target = g.document.target ? `_${g.document.target.company.replace(/[^\p{L}\p{N}]+/gu, "_")}` : "";
  return `${name}_Resume_${g.template.name.replace(/[^\p{L}\p{N}]+/gu, "")}${target}.${ext}`;
}

export async function downloadPdf(g: GeneratedResume) {
  const { renderResumePdf, fetchFont } = await import("./pdf");
  const bytes = await renderResumePdf(g.layout, { loadFont: fetchFont, title: `${g.document.header.name} — Résumé`, author: g.document.header.name });
  save(new Uint8Array(bytes), "application/pdf", resumeFilename(g, "pdf"));
}

export function downloadDocx(g: GeneratedResume) {
  save(buildResumeDocx(g.document, g.template), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", resumeFilename(g, "docx"));
}
