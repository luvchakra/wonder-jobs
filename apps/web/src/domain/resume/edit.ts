/**
 * The candidate's own edits to a generated résumé (owner, 2026-10-25: edit in the preview, save, download the
 * edited one). Whatever they typed is theirs: a bullet whose words changed reads USER_PROVIDED and no longer
 * claims the Career Profile facts it was built from; empty lines and empty items are dropped; nothing else is
 * touched, so a template change still renders the same edited facts.
 */
import type { ResumeBullet, ResumeDocument, ResumeSection, ResumeSkillGroup } from "./document";
import { groupSkills } from "./document";

const tidy = (s: string | undefined) => (s ?? "").replace(/[ \t]+/g, " ").trim();

/** Lines of a multi-line box as bullets, keeping a bullet's evidence when its words are unchanged. */
export function bulletsFromLines(text: string, before: ResumeBullet[] = []): ResumeBullet[] {
  return text
    .split(/\n+/)
    .map((l) => tidy(l.replace(/^[•\-*]\s*/, "")))
    .filter(Boolean)
    .map((line) => before.find((b) => tidy(b.text) === line) ?? { text: line, evidenceIds: [], provenance: "USER_PROVIDED" });
}

/** One bullet's new words: unchanged words keep their evidence; changed words are the candidate's own. */
export function editBullet(before: ResumeBullet | undefined, text: string): ResumeBullet {
  return before && tidy(before.text) === tidy(text) ? { ...before, text } : { text, evidenceIds: [], provenance: "USER_PROVIDED" };
}

/**
 * An edited skills list, keeping the template's groups (owner, 2026-10-25: an edit never changes the
 * résumé's format): a skill that was in a group stays in it, in the new order; only new skills are grouped.
 */
export function skillsFromList(list: string[], before: ResumeSkillGroup[]): ResumeSkillGroup[] {
  const home = new Map(before.flatMap((g) => g.skills.map((s) => [s.toLowerCase(), g.name] as const)));
  const fresh = groupSkills(list.filter((s) => !home.has(s.toLowerCase())));
  const freshHome = new Map(fresh.flatMap((g) => g.skills.map((s) => [s.toLowerCase(), g.name] as const)));
  const names = [...before.map((g) => g.name), ...fresh.map((g) => g.name)].filter((n, i, all) => all.indexOf(n) === i);
  return names
    .map((name) => ({ name, skills: list.filter((s) => (home.get(s.toLowerCase()) ?? freshHome.get(s.toLowerCase())) === name) }))
    .filter((g) => g.skills.length > 0);
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
  // Empty bullets and items (a line added and left blank) are dropped; every other word stays as typed.
  const bullets = (list: ResumeBullet[]) => list.map((b) => ({ ...b, text: tidy(b.text) })).filter((b) => b.text);
  const clean = (s: ResumeSection): ResumeSection => {
    switch (s.type) {
      case "strengths":
        return { ...s, items: s.items.map(tidy).filter(Boolean) };
      case "selected_achievements":
        return { ...s, items: bullets(s.items) };
      case "experience":
        return { ...s, items: s.items.map((e) => ({ ...e, bullets: bullets(e.bullets) })) };
      case "projects":
        return { ...s, items: s.items.map((p) => (p.bullets ? { ...p, bullets: bullets(p.bullets) } : p)) };
      default:
        return s;
    }
  };
  return { ...doc, header: { ...doc.header, name: tidy(doc.header.name) || doc.header.name }, sections: doc.sections.map(clean).filter(keep), metadata: { ...doc.metadata, editedAt: now } };
}
