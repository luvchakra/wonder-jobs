/**
 * Content and structure checks run before a résumé can be downloaded (spec §34, §74–76). Layout
 * checks come from the layout engine's diagnostics; both feed one gate.
 */
import { isEmail, isHttpUrl, isPhone } from "@/domain/career/history";
import type { ResumeDocument } from "./document";
import { STANDARD_HEADINGS, type ResumeTemplate } from "./templates";
import type { LayoutDiagnostics } from "./layout";

export type IssueLevel = "critical" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  group: "content" | "structure" | "layout" | "ats" | "links";
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  checks: { group: ValidationIssue["group"]; label: string; ok: boolean }[];
}

const PLACEHOLDER = /\[[^\]\n]{0,80}\]|\{\{[^}]*\}\}/;
const BAD_TOKEN = /\b(undefined|null|NaN)\b/;

function allText(doc: ResumeDocument): string[] {
  const out: string[] = Object.values(doc.header).filter((v): v is string => typeof v === "string");
  for (const s of doc.sections) {
    switch (s.type) {
      case "summary":
        out.push(s.text);
        break;
      case "strengths":
      case "transferable_skills":
      case "research_interests":
        out.push(...s.items);
        break;
      case "skills":
        for (const g of s.groups) out.push(...g.skills);
        break;
      case "selected_achievements":
        out.push(...s.items.map((b) => b.text));
        break;
      case "experience":
        for (const e of s.items) out.push(e.employer, e.title, e.location ?? "", e.summary ?? "", ...e.bullets.map((b) => b.text));
        break;
      case "education":
        for (const e of s.items) out.push(e.institution, e.degree ?? "", e.field ?? "", ...(e.honors ?? []));
        break;
      case "certifications":
        for (const c of s.items) out.push(c.name, c.issuer ?? "");
        break;
      case "projects":
        for (const p of s.items) out.push(p.name, p.description ?? "", ...(p.technologies ?? []), ...(p.bullets ?? []).map((b) => b.text));
        break;
      case "publications":
        for (const p of s.items) out.push(p.title, p.publication ?? "", ...(p.authors ?? []));
        break;
    }
  }
  return out;
}

export function validateResume(doc: ResumeDocument, template: ResumeTemplate, layout: LayoutDiagnostics | null, opts: { expectExperience?: boolean } = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (level: IssueLevel, group: ValidationIssue["group"], message: string) => issues.push({ level, group, message });
  const shown = template.design.sections.filter((s) => doc.sections.some((d) => d.type === s.type));

  // Content
  if (!doc.header.name.trim()) add("critical", "content", "Your name is missing — add it to your Career Profile.");
  const hasExperience = doc.sections.some((s) => s.type === "experience");
  if (opts.expectExperience && !hasExperience) add("critical", "content", "No work history yet — add your roles under Career Profile → Work history.");
  const text = allText(doc);
  const placeholder = text.find((t) => PLACEHOLDER.test(t));
  if (placeholder) add("critical", "content", `Unresolved placeholder: “${placeholder.match(PLACEHOLDER)![0]}” — replace it with the real detail or remove it.`);
  const bad = text.find((t) => BAD_TOKEN.test(t));
  if (bad) add("critical", "content", `The text “${bad.slice(0, 60)}” looks like a data error.`);

  // Structure
  if (!shown.length) add("critical", "structure", "Nothing in your profile fits this template's sections yet.");
  const headings = shown.map((s) => s.title.toLowerCase());
  if (new Set(headings).size !== headings.length) add("critical", "structure", "A section would appear twice.");

  // ATS
  const nonStandard = shown.filter((s) => !STANDARD_HEADINGS.has(s.title.toLowerCase()));
  if (nonStandard.length) add("warning", "ats", `Non-standard headings: ${nonStandard.map((s) => s.title).join(", ")}.`);

  // Links
  const h = doc.header;
  if (h.email && !isEmail(h.email)) add("warning", "links", `Your email “${h.email}” doesn't look valid.`);
  if (h.phone && !isPhone(h.phone)) add("warning", "links", `Your phone number “${h.phone}” doesn't look valid.`);
  for (const [label, url] of [["LinkedIn", h.linkedinUrl], ["Portfolio", h.portfolioUrl], ["Website", h.websiteUrl]] as const) if (url && !isHttpUrl(url)) add("warning", "links", `Your ${label} link couldn't be validated.`);

  // Layout (from the engine)
  if (layout) {
    if (layout.overflowElements.length) add("critical", "layout", `Text runs past the page edge: ${layout.overflowElements.slice(0, 2).join("; ")}.`);
    if (layout.outOfBoundsElements.length) add("critical", "layout", "Content falls outside the printable area.");
    if (layout.overlappingElements.length) add("critical", "layout", "Some elements overlap.");
    if (layout.emptyPages.length) add("critical", "layout", "The layout produced an empty page.");
    if (layout.orphanHeadings.length) add("critical", "layout", `A heading was left at the bottom of a page: ${layout.orphanHeadings[0]}.`);
    if (layout.missingGlyphs.length) add("warning", "layout", `Some characters can't be shown in this template's fonts: ${layout.missingGlyphs.slice(0, 5).join(" ")}.`);
  }

  const failed = (g: ValidationIssue["group"]) => issues.some((i) => i.group === g && i.level === "critical");
  const warned = (g: ValidationIssue["group"]) => issues.some((i) => i.group === g);
  return {
    ok: !issues.some((i) => i.level === "critical"),
    issues,
    checks: [
      { group: "content", label: "Required candidate data", ok: !failed("content") },
      { group: "structure", label: "Section order", ok: !failed("structure") },
      { group: "layout", label: layout ? `No overflow · ${layout.pageCount} page${layout.pageCount === 1 ? "" : "s"}` : "Layout", ok: !!layout && !failed("layout") },
      { group: "ats", label: "Selectable text, standard headings, no text in images", ok: !warned("ats") },
      { group: "links", label: "Email, phone and links", ok: !warned("links") },
    ],
  };
}
