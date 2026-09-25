/**
 * The résumé template registry (spec §15–16, §29): eight versioned templates, each with metadata
 * the gallery shows and design tokens every renderer reads. The gallery, the preview, the PDF and the
 * DOCX all come from these objects — no template name or style is written anywhere else.
 *
 * A template's rendering never changes silently: a material change gets a new id (`executive-v2`),
 * and saved résumés keep rendering with the version they were made with (spec §64).
 */
import type { ResumeSectionType } from "./document";

export type FontFamilyKey = "inter" | "serif" | "plex";

export interface ResumeTheme {
  primary: string;
  text: string;
  muted: string;
  border: string;
  /** Header band / chip fill. */
  tint: string;
}

export interface TemplateDesign {
  page: { size: "A4"; margin: { top: number; right: number; bottom: number; left: number } };
  fonts: { name: FontFamilyKey; heading: FontFamilyKey; body: FontFamilyKey };
  /** Point sizes. */
  size: { name: number; headline: number; contact: number; section: number; entryTitle: number; body: number; small: number };
  lineHeight: number;
  space: { section: number; afterHeading: number; entry: number; bullet: number; bulletIndent: number; header: number };
  theme: ResumeTheme;
  header: "centered" | "left" | "band" | "left-accent";
  nameCase: "normal" | "upper";
  sectionHeading: "rule" | "accent" | "bar" | "plain";
  sectionCase: "upper" | "normal";
  skills: "chips" | "columns" | "grouped" | "inline";
  entry: "title-first" | "company-first";
  /** The sections this template shows, in order, with the heading each gets. */
  sections: { type: ResumeSectionType; title: string }[];
  /** DOCX has no embedded fonts: a widely installed family per template (spec §41). */
  docxFont: { body: "Arial" | "Georgia"; heading: "Arial" | "Georgia" };
}

export type TemplateFamily = "executive" | "modern" | "technical" | "classic-ats" | "leadership" | "career-shift" | "academic" | "creative";
export type TemplateFilter = "ats" | "modern" | "executive" | "technical" | "creative" | "minimal";

export interface ResumeTemplate {
  id: string;
  version: string;
  name: string;
  family: TemplateFamily;
  description: string;
  tags: string[];
  filters: TemplateFilter[];
  industries: string[];
  recommendedFor: string[];
  atsCompatibility: "high" | "very-high";
  density: "compact" | "balanced" | "spacious";
  columns: 1 | 2;
  supportedSections: ResumeSectionType[];
  defaultSectionOrder: ResumeSectionType[];
  capabilities: { photo: boolean; icons: boolean; accentColor: boolean; sidebar: boolean; tables: boolean };
  design: TemplateDesign;
}

const A4_MARGIN = { top: 44, right: 46, bottom: 44, left: 46 };

function template(t: Omit<ResumeTemplate, "supportedSections" | "defaultSectionOrder" | "columns" | "capabilities"> & { capabilities?: Partial<ResumeTemplate["capabilities"]> }): ResumeTemplate {
  const order = t.design.sections.map((s) => s.type);
  return { ...t, columns: 1, supportedSections: order, defaultSectionOrder: order, capabilities: { photo: false, icons: false, accentColor: true, sidebar: false, tables: false, ...t.capabilities } };
}

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  template({
    id: "executive-v1",
    version: "1",
    name: "Executive",
    family: "executive",
    description: "Best for senior leadership roles",
    tags: ["Modern", "ATS Friendly"],
    filters: ["executive", "ats", "modern"],
    industries: ["Technology", "Fintech", "Consulting", "Healthcare", "Telecom"],
    recommendedFor: ["Directors", "Senior Directors", "VP", "C-suite", "Experienced professionals"],
    atsCompatibility: "very-high",
    density: "balanced",
    design: {
      page: { size: "A4", margin: A4_MARGIN },
      fonts: { name: "serif", heading: "inter", body: "inter" },
      size: { name: 24, headline: 11, contact: 8.5, section: 9.5, entryTitle: 10, body: 9.3, small: 8.5 },
      lineHeight: 1.38,
      space: { section: 13, afterHeading: 6, entry: 9, bullet: 2.2, bulletIndent: 11, header: 12 },
      theme: { primary: "#3b2a8f", text: "#15132b", muted: "#55577a", border: "#d9d8ee", tint: "#efedfb" },
      header: "centered",
      nameCase: "normal",
      sectionHeading: "rule",
      sectionCase: "upper",
      skills: "chips",
      entry: "company-first",
      sections: [
        { type: "summary", title: "Executive Summary" },
        { type: "skills", title: "Key Strengths" },
        { type: "experience", title: "Professional Experience" },
        { type: "education", title: "Education" },
        { type: "certifications", title: "Certifications" },
      ],
      docxFont: { body: "Arial", heading: "Georgia" },
    },
  }),
  template({
    id: "modern-minimal-v1",
    version: "1",
    name: "Modern Minimal",
    family: "modern",
    description: "Clean and contemporary design",
    tags: ["Modern", "ATS Friendly"],
    filters: ["modern", "minimal", "ats"],
    industries: ["Technology", "Fintech", "Consumer", "E-commerce", "Media", "Education"],
    recommendedFor: ["Broad professional use"],
    atsCompatibility: "very-high",
    density: "spacious",
    capabilities: { accentColor: false },
    design: {
      page: { size: "A4", margin: { top: 48, right: 52, bottom: 48, left: 52 } },
      fonts: { name: "inter", heading: "inter", body: "inter" },
      size: { name: 21, headline: 10, contact: 8.5, section: 9.5, entryTitle: 10, body: 9.4, small: 8.5 },
      lineHeight: 1.45,
      space: { section: 15, afterHeading: 6, entry: 10, bullet: 2.5, bulletIndent: 11, header: 14 },
      theme: { primary: "#15132b", text: "#1f1d36", muted: "#5d5f80", border: "#dedde9", tint: "#f3f3f8" },
      header: "left",
      nameCase: "upper",
      sectionHeading: "rule",
      sectionCase: "upper",
      skills: "columns",
      entry: "company-first",
      sections: [
        { type: "summary", title: "Professional Summary" },
        { type: "skills", title: "Core Competencies" },
        { type: "experience", title: "Professional Experience" },
        { type: "projects", title: "Projects" },
        { type: "education", title: "Education" },
        { type: "certifications", title: "Certifications" },
      ],
      docxFont: { body: "Arial", heading: "Arial" },
    },
  }),
  template({
    id: "technical-v1",
    version: "1",
    name: "Technical",
    family: "technical",
    description: "Skills-focused layout for technology roles",
    tags: ["ATS Friendly", "Structured"],
    filters: ["technical", "ats"],
    industries: ["Technology", "Fintech", "Telecom", "Gaming"],
    recommendedFor: ["Engineering", "Software", "Cybersecurity", "Data", "Cloud", "Technical leadership"],
    atsCompatibility: "very-high",
    density: "compact",
    design: {
      page: { size: "A4", margin: { top: 38, right: 42, bottom: 38, left: 42 } },
      fonts: { name: "plex", heading: "plex", body: "plex" },
      size: { name: 20, headline: 10, contact: 8.3, section: 9.5, entryTitle: 9.8, body: 9, small: 8.3 },
      lineHeight: 1.33,
      space: { section: 11, afterHeading: 5, entry: 8, bullet: 1.8, bulletIndent: 10, header: 10 },
      theme: { primary: "#1d4ed8", text: "#111827", muted: "#4b5563", border: "#d6dbe6", tint: "#eef2fb" },
      header: "left-accent",
      nameCase: "upper",
      sectionHeading: "accent",
      sectionCase: "upper",
      skills: "grouped",
      entry: "title-first",
      sections: [
        { type: "summary", title: "Summary" },
        { type: "skills", title: "Technical Skills" },
        { type: "experience", title: "Experience" },
        { type: "projects", title: "Projects" },
        { type: "certifications", title: "Certifications" },
        { type: "education", title: "Education" },
      ],
      docxFont: { body: "Arial", heading: "Arial" },
    },
  }),
  template({
    id: "classic-ats-v1",
    version: "1",
    name: "Classic ATS",
    family: "classic-ats",
    description: "Professional and traditional format",
    tags: ["ATS Friendly", "Widely Accepted"],
    filters: ["ats", "minimal"],
    industries: ["Technology", "Fintech", "Consulting", "Healthcare", "Telecom", "Education", "Media", "Government"],
    recommendedFor: ["Broad applications", "Maximum ATS compatibility"],
    atsCompatibility: "very-high",
    density: "balanced",
    capabilities: { accentColor: false },
    design: {
      page: { size: "A4", margin: { top: 46, right: 50, bottom: 46, left: 50 } },
      fonts: { name: "serif", heading: "serif", body: "serif" },
      size: { name: 18, headline: 10, contact: 9, section: 10, entryTitle: 10, body: 9.8, small: 9 },
      lineHeight: 1.35,
      space: { section: 12, afterHeading: 5, entry: 8, bullet: 2, bulletIndent: 12, header: 10 },
      theme: { primary: "#000000", text: "#111111", muted: "#3a3a3a", border: "#555555", tint: "#ffffff" },
      header: "centered",
      nameCase: "upper",
      sectionHeading: "rule",
      sectionCase: "upper",
      skills: "inline",
      entry: "title-first",
      sections: [
        { type: "summary", title: "Summary" },
        { type: "experience", title: "Experience" },
        { type: "education", title: "Education" },
        { type: "skills", title: "Skills" },
        { type: "certifications", title: "Certifications" },
        { type: "projects", title: "Projects" },
        { type: "publications", title: "Publications" },
      ],
      docxFont: { body: "Georgia", heading: "Georgia" },
    },
  }),
  template({
    id: "leadership-v1",
    version: "1",
    name: "Leadership",
    family: "leadership",
    description: "Showcase leadership and impact",
    tags: ["Executive", "ATS Friendly"],
    filters: ["executive", "ats"],
    industries: ["Technology", "Fintech", "Consulting", "Healthcare", "Telecom", "Consumer"],
    recommendedFor: ["Practice leads", "People leaders", "Program leaders", "Transformation leaders"],
    atsCompatibility: "high",
    density: "balanced",
    design: {
      page: { size: "A4", margin: A4_MARGIN },
      fonts: { name: "serif", heading: "serif", body: "inter" },
      size: { name: 23, headline: 9.5, contact: 8.5, section: 10.5, entryTitle: 10, body: 9.3, small: 8.5 },
      lineHeight: 1.38,
      space: { section: 13, afterHeading: 6, entry: 9, bullet: 2.2, bulletIndent: 11, header: 12 },
      theme: { primary: "#7a4a12", text: "#1c1917", muted: "#57534e", border: "#e7dccb", tint: "#fbf5ec" },
      header: "band",
      nameCase: "normal",
      sectionHeading: "bar",
      sectionCase: "upper",
      skills: "chips",
      entry: "company-first",
      sections: [
        { type: "summary", title: "Executive Profile" },
        { type: "strengths", title: "Leadership Highlights" },
        { type: "experience", title: "Professional Experience" },
        { type: "skills", title: "Core Skills" },
        { type: "education", title: "Education" },
        { type: "certifications", title: "Certifications" },
      ],
      docxFont: { body: "Arial", heading: "Georgia" },
    },
  }),
  template({
    id: "career-shift-v1",
    version: "1",
    name: "Career Shift",
    family: "career-shift",
    description: "Ideal for transitioning to new roles",
    tags: ["Flexible", "ATS Friendly"],
    filters: ["modern", "ats"],
    industries: ["Technology", "Fintech", "Consumer", "E-commerce", "Education", "Media"],
    recommendedFor: ["Changing role family", "Changing industry", "Changing function"],
    atsCompatibility: "high",
    density: "balanced",
    design: {
      page: { size: "A4", margin: A4_MARGIN },
      fonts: { name: "serif", heading: "inter", body: "inter" },
      size: { name: 22, headline: 10, contact: 8.5, section: 9.5, entryTitle: 10, body: 9.3, small: 8.5 },
      lineHeight: 1.4,
      space: { section: 13, afterHeading: 6, entry: 9, bullet: 2.2, bulletIndent: 11, header: 12 },
      theme: { primary: "#2f3fb5", text: "#16163a", muted: "#555a86", border: "#d8dcf2", tint: "#eef0fc" },
      header: "band",
      nameCase: "normal",
      sectionHeading: "accent",
      sectionCase: "upper",
      skills: "chips",
      entry: "company-first",
      sections: [
        { type: "summary", title: "Professional Summary" },
        { type: "transferable_skills", title: "Transferable Skills" },
        { type: "selected_achievements", title: "Selected Achievements" },
        { type: "experience", title: "Relevant Experience" },
        { type: "projects", title: "Projects" },
        { type: "certifications", title: "Certifications" },
        { type: "education", title: "Education" },
      ],
      docxFont: { body: "Arial", heading: "Arial" },
    },
  }),
  template({
    id: "academic-v1",
    version: "1",
    name: "Academic / Research",
    family: "academic",
    description: "For academic, research or specialized roles",
    tags: ["Structured", "ATS Friendly"],
    filters: ["ats", "minimal"],
    industries: ["Education", "Healthcare", "Technology", "Research"],
    recommendedFor: ["Researchers", "Academics", "Research-heavy careers"],
    atsCompatibility: "very-high",
    density: "balanced",
    design: {
      page: { size: "A4", margin: A4_MARGIN },
      fonts: { name: "serif", heading: "serif", body: "serif" },
      size: { name: 20, headline: 10, contact: 8.8, section: 10.5, entryTitle: 10, body: 9.6, small: 8.8 },
      lineHeight: 1.36,
      space: { section: 12, afterHeading: 5, entry: 8, bullet: 2, bulletIndent: 12, header: 10 },
      theme: { primary: "#1e3a5f", text: "#141a22", muted: "#4a5563", border: "#cfd8e3", tint: "#eef3f8" },
      header: "left",
      nameCase: "normal",
      sectionHeading: "rule",
      sectionCase: "normal",
      skills: "inline",
      entry: "title-first",
      sections: [
        { type: "research_interests", title: "Research Interests" },
        { type: "education", title: "Education" },
        { type: "publications", title: "Publications" },
        { type: "experience", title: "Professional Experience" },
        { type: "projects", title: "Projects" },
        { type: "certifications", title: "Certifications" },
        { type: "skills", title: "Skills" },
      ],
      docxFont: { body: "Georgia", heading: "Georgia" },
    },
  }),
  template({
    id: "creative-modern-v1",
    version: "1",
    name: "Creative Modern",
    family: "creative",
    description: "A modern and visually engaging design",
    tags: ["Modern", "ATS Friendly"],
    filters: ["creative", "modern", "ats"],
    industries: ["Consumer", "E-commerce", "Media", "Gaming", "Technology", "Travel"],
    recommendedFor: ["Product", "Design", "Marketing", "Creative technology"],
    atsCompatibility: "high",
    density: "balanced",
    design: {
      page: { size: "A4", margin: A4_MARGIN },
      fonts: { name: "inter", heading: "inter", body: "inter" },
      size: { name: 23, headline: 10.5, contact: 8.5, section: 9.5, entryTitle: 10, body: 9.3, small: 8.5 },
      lineHeight: 1.4,
      space: { section: 13, afterHeading: 6, entry: 9, bullet: 2.2, bulletIndent: 11, header: 12 },
      theme: { primary: "#6d28d9", text: "#1a1333", muted: "#5b5478", border: "#e2dcf5", tint: "#f4effe" },
      header: "band",
      nameCase: "normal",
      sectionHeading: "bar",
      sectionCase: "upper",
      skills: "chips",
      entry: "title-first",
      sections: [
        { type: "summary", title: "Profile" },
        { type: "skills", title: "Key Skills" },
        { type: "experience", title: "Experience" },
        { type: "projects", title: "Projects" },
        { type: "education", title: "Education" },
        { type: "certifications", title: "Certifications" },
      ],
      docxFont: { body: "Arial", heading: "Arial" },
    },
  }),
];

export const TEMPLATE_FILTER_LABEL: Record<TemplateFilter, string> = { ats: "ATS Friendly", modern: "Modern", executive: "Executive", technical: "Technical", creative: "Creative", minimal: "Minimal" };

export function getTemplate(id: string): ResumeTemplate | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}

/** Headings an ATS reliably recognizes; every template's section titles must be among them (ATS check). */
export const STANDARD_HEADINGS = new Set(
  ["summary", "professional summary", "executive summary", "executive profile", "profile", "key strengths", "core competencies", "core skills", "key skills", "skills", "technical skills", "leadership highlights", "transferable skills", "selected achievements", "experience", "professional experience", "relevant experience", "work experience", "education", "certifications", "projects", "publications", "research interests"].map((s) => s.toLowerCase()),
);
