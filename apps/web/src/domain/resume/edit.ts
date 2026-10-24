/**
 * The candidate's own edits to a generated résumé (owner, 2026-10-25: edit in the preview, Cancel or Save, download
 * the edited one). Whatever they typed is theirs: a line whose words changed reads USER_PROVIDED and no longer claims
 * the Career Profile facts it was built from. On Save, words are trimmed, empty lines, chips and entries are dropped
 * (empty sections never exist) and the edit is stamped; the template, and so the format, is untouched.
 */
import { groupSkills, type ResumeBullet, type ResumeDocument, type ResumeSection } from "./document";

const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** A line after an edit: the same line while its words are unchanged, otherwise the candidate's own. */
export function editedBullet(before: ResumeBullet | undefined, text: string, fresh = false): ResumeBullet {
  if (!fresh && before && before.text === text) return before;
  return { text, evidenceIds: [], provenance: "USER_PROVIDED" };
}

const lines = (bs: ResumeBullet[]) => bs.map((b) => (b.text === tidy(b.text) ? b : { ...b, text: tidy(b.text) })).filter((b) => b.text);
const words = (xs: string[]) => xs.map(tidy).filter(Boolean);

function tidySection(s: ResumeSection): ResumeSection {
  switch (s.type) {
    case "summary":
      return { ...s, text: s.text.trim() };
    case "strengths":
    case "transferable_skills":
    case "research_interests":
      return { ...s, items: words(s.items) };
    case "selected_achievements":
      return { ...s, items: lines(s.items) };
    case "skills": {
      const list = words(s.ordered ?? s.groups.flatMap((g) => g.skills));
      return { ...s, ordered: list, groups: groupSkills(list) };
    }
    case "experience":
      return { ...s, items: s.items.filter((e) => tidy(e.employer) || tidy(e.title)).map((e) => ({ ...e, employer: tidy(e.employer), title: tidy(e.title), bullets: lines(e.bullets) })) };
    case "education":
      return { ...s, items: s.items.filter((e) => tidy(e.institution)).map((e) => ({ ...e, institution: tidy(e.institution), degree: tidy(e.degree) || undefined })) };
    case "certifications":
      return { ...s, items: s.items.filter((c) => tidy(c.name)).map((c) => ({ ...c, name: tidy(c.name), issuer: tidy(c.issuer) || undefined })) };
    case "projects":
      return { ...s, items: s.items.filter((p) => tidy(p.name)).map((p) => ({ ...p, name: tidy(p.name), bullets: p.bullets ? lines(p.bullets) : undefined })) };
    case "publications":
      return { ...s, items: s.items.filter((p) => tidy(p.title)).map((p) => ({ ...p, title: tidy(p.title) })) };
  }
}

const hasContent = (s: ResumeSection): boolean => (s.type === "summary" ? !!s.text : s.type === "skills" ? s.groups.some((g) => g.skills.length > 0) : s.items.length > 0);

/** The edited document as it's saved. */
export function finishEdit(doc: ResumeDocument, now = new Date().toISOString()): ResumeDocument {
  const header = Object.fromEntries(Object.entries(doc.header).map(([k, v]) => [k, typeof v === "string" ? tidy(v) || undefined : v])) as ResumeDocument["header"];
  return { ...doc, header: { ...header, name: header.name || doc.header.name }, sections: doc.sections.map(tidySection).filter(hasContent), metadata: { ...doc.metadata, editedAt: now } };
}
