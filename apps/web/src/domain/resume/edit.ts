/**
 * The candidate's own edits to a generated résumé (owner, 2026-10-25: edit in the preview, save, download the
 * edited one). Whatever they typed is theirs: a bullet whose words changed reads USER_PROVIDED and no longer
 * claims the Career Profile facts it was built from; empty lines and empty items are dropped; nothing else is
 * touched, so a template change still renders the same edited facts.
 */
import type { ResumeBullet, ResumeDocument, ResumeSection } from "./document";

const tidy = (s: string | undefined) => (s ?? "").replace(/[ \t]+/g, " ").trim();

/** Lines of a multi-line box as bullets, keeping a bullet's evidence when its words are unchanged. */
export function bulletsFromLines(text: string, before: ResumeBullet[] = []): ResumeBullet[] {
  return text
    .split(/\n+/)
    .map((l) => tidy(l.replace(/^[•\-*]\s*/, "")))
    .filter(Boolean)
    .map((line) => before.find((b) => tidy(b.text) === line) ?? { text: line, evidenceIds: [], provenance: "USER_PROVIDED" });
}

/** A comma- or line-separated box as a list. */
export function listFrom(text: string): string[] {
  return text.split(/[,\n]+/).map(tidy).filter(Boolean);
}

/** Drops sections the edits emptied (empty sections never exist) and stamps the edit. */
export function finishEdit(doc: ResumeDocument, now = new Date().toISOString()): ResumeDocument {
  const keep = (s: ResumeSection): boolean => {
    switch (s.type) {
      case "summary":
        return !!tidy(s.text);
      case "skills":
        return s.groups.some((g) => g.skills.length > 0);
      default:
        return s.items.length > 0;
    }
  };
  return { ...doc, header: { ...doc.header, name: tidy(doc.header.name) || doc.header.name }, sections: doc.sections.filter(keep), metadata: { ...doc.metadata, editedAt: now } };
}
