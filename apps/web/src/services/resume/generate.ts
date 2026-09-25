/**
 * The résumé generation pipeline (spec §27, §33): each stage is real work, reported as it finishes.
 * Nothing here calls a model — the document is the candidate's own facts, selected and ordered;
 * the template decides only how they look.
 */
import type { CareerDNA } from "@/domain/career/types";
import { historyOf } from "@/domain/career/history";
import { buildResumeDocument, type ResumeDocument, type TargetJob } from "@/domain/resume/document";
import { layoutResume, type ResumeLayout } from "@/domain/resume/layout";
import { getTemplate, type ResumeTemplate } from "@/domain/resume/templates";
import { validateResume, type ValidationReport } from "@/domain/resume/validate";

export type GenerationStage = "select" | "tailor" | "render" | "paginate" | "ats";

export const STAGE_LABEL: Record<GenerationStage, (t: ResumeTemplate, target?: TargetJob) => string> = {
  select: () => "Selecting your experience",
  tailor: (_t, target) => `Ordering it for ${target?.title ?? "the role"}`,
  render: (t) => `Rendering ${t.name} template`,
  paginate: () => "Checking pagination",
  ats: () => "Checking ATS structure",
};

export interface GeneratedResume {
  template: ResumeTemplate;
  document: ResumeDocument;
  layout: ResumeLayout;
  report: ValidationReport;
}

const nextFrame = () => new Promise<void>((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function generateResume(dna: CareerDNA, templateId: string, opts: { target?: TargetJob; onStage?: (s: GenerationStage) => void } = {}): Promise<GeneratedResume> {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown template ${templateId}`);
  const step = async (s: GenerationStage) => {
    opts.onStage?.(s);
    // Let the UI paint the stage before the (short) work that follows it.
    await nextFrame();
  };
  await step("select");
  const document = buildResumeDocument(dna, { target: opts.target });
  if (opts.target) await step("tailor");
  await step("render");
  const layout = layoutResume(document, template);
  await step("paginate");
  await step("ats");
  const report = validateResume(document, template, layout.diagnostics, { expectExperience: dna.yearsExperience > 0 || historyOf(dna).experience.length > 0 });
  return { template, document, layout, report };
}

/** Re-render a saved snapshot with the template version it was made with. */
export function renderSaved(document: ResumeDocument, templateId: string): GeneratedResume | null {
  const template = getTemplate(templateId);
  if (!template) return null;
  const layout = layoutResume(document, template);
  return { template, document, layout, report: validateResume(document, template, layout.diagnostics) };
}
