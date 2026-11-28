import { EMPTY_DNA, type CareerDNA } from "./types";
import { EMPTY_HISTORY, type CareerHistory } from "./history";
import { buildHistoryPatch, reviewHistoryImport, type HistoryDraft } from "./historyImport";
import type { ResumeDocument } from "@/domain/resume/document";

/**
 * A role with its own résumé is that résumé's person (owner, 2026-11-26: "for reinsurance the profile picked up
 * should be deepak not Kunal"): what's built for the role (its résumé, cover letters, answers) starts from that file
 * alone — its name, contact, headline, history, education and skills — never mixed with the Career Profile's. The
 * role's own fields go over it as for any role (`draftingProfile`).
 */

/** What the stored-file reader returns (`/api/resume-files/[id]/read`, the same reading Update from your résumé uses). */
export interface FileReading {
  draft: { name?: string; headline?: string; yearsExperience?: number; seniority?: CareerDNA["seniority"]; skills?: CareerDNA["skills"]; industries?: string[]; preferredLocations?: string[] };
  history: HistoryDraft;
}

/** The file's person as a profile: everything it says, nothing from anyone else. */
export function dnaFromReading(r: FileReading, at: string): CareerDNA {
  const everything = reviewHistoryImport(r.history, undefined).map((i) => i.key);
  const history = buildHistoryPatch(r.history, undefined, everything);
  return {
    ...EMPTY_DNA,
    name: (r.draft.name ?? "").trim(),
    headline: (r.draft.headline ?? "").trim(),
    yearsExperience: r.draft.yearsExperience ?? 0,
    seniority: r.draft.seniority ?? EMPTY_DNA.seniority,
    skills: r.draft.skills ?? [],
    industries: r.draft.industries ?? [],
    preferredLocations: r.draft.preferredLocations ?? [],
    strengths: [],
    history,
    updatedAt: at,
  };
}

/** A résumé made in Resume Studio, chosen as a role's résumé: its own header and sections as a profile. */
export function dnaFromDocument(doc: ResumeDocument): CareerDNA {
  const h: CareerHistory = { ...EMPTY_HISTORY, contact: {}, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] };
  const c = doc.header;
  for (const [k, v] of [["email", c.email], ["phone", c.phone], ["location", c.location], ["linkedinUrl", c.linkedinUrl], ["portfolioUrl", c.portfolioUrl], ["websiteUrl", c.websiteUrl]] as const) if (v) h.contact[k] = v;
  let skills: CareerDNA["skills"] = [];
  let strengths: string[] = [];
  for (const s of doc.sections) {
    if (s.type === "summary") h.summary = s.text;
    if (s.type === "strengths") strengths = [...s.items];
    if (s.type === "skills") skills = (s.ordered ?? s.groups.flatMap((g) => g.skills)).map((name) => ({ name, level: 3 as const }));
    if (s.type === "experience") h.experience = s.items.map((e) => ({ id: e.id, employer: e.employer, title: e.title, location: e.location, startDate: e.startDate, endDate: e.endDate, current: e.current, summary: e.summary, bullets: e.bullets.map((b, i) => ({ id: `${e.id}-b${i}`, text: b.text, provenance: "RESUME_IMPORTED" as const })), provenance: "RESUME_IMPORTED" as const }));
    if (s.type === "education") h.education = s.items.map((e) => ({ id: e.id, institution: e.institution, degree: e.degree, field: e.field, location: e.location, startDate: e.startDate, endDate: e.endDate, honors: e.honors, provenance: "RESUME_IMPORTED" as const }));
    if (s.type === "certifications") h.certifications = s.items.map((x) => ({ id: x.id, name: x.name, issuer: x.issuer, issueDate: x.issueDate, expiryDate: x.expiryDate, credentialId: x.credentialId, url: x.url, provenance: "RESUME_IMPORTED" as const }));
  }
  return { ...EMPTY_DNA, name: c.name, headline: c.headline ?? "", skills, strengths, history: h, updatedAt: doc.metadata.builtAt };
}

const key = (s: string) => s.trim().toLowerCase();

/** A role's skill choices over its file's: what was added or changed by hand, and the file's skills taken off. */
export interface RoleSkillChoices {
  skills?: CareerDNA["skills"];
  skillsOwn?: boolean;
  skillsRemoved?: string[];
}

/**
 * A role with its own résumé takes its skills from that file (owner, 2026-11-27: "Use the file's skills"), less the
 * ones taken off, plus the ones added by hand; a hand-added skill wins over the file's same skill. A role saved before
 * hand-added skills were recorded (`skillsOwn` unset) counts as hand-added only the skills My profile doesn't have:
 * the rest were copied in when the role was made.
 */
export function fileRoleSkills(fileSkills: CareerDNA["skills"], role: RoleSkillChoices | undefined, mySkills: CareerDNA["skills"]): CareerDNA["skills"] {
  const mine = new Set(mySkills.map((s) => key(s.name)));
  const added = role?.skillsOwn ? (role.skills ?? []) : (role?.skills ?? []).filter((s) => !mine.has(key(s.name)));
  const byHand = new Set(added.map((s) => key(s.name)));
  const off = new Set((role?.skillsRemoved ?? []).map(key));
  return [...fileSkills.filter((s) => !byHand.has(key(s.name)) && !off.has(key(s.name))), ...added];
}

/**
 * What the form keeps for a role with its own résumé when its skills are edited (owner, 2026-11-28): the skills that
 * aren't the file's own as it has them (added, or a file skill's strength changed) recorded as hand-added, and the
 * file's skills no longer listed recorded as taken off, so a removal sticks. At most 60 of each.
 */
export function editFileRoleSkills(fileSkills: CareerDNA["skills"], next: CareerDNA["skills"], before: RoleSkillChoices | undefined): Required<RoleSkillChoices> {
  const inNext = new Set(next.map((s) => key(s.name)));
  const fromFile = (s: { name: string; level: number }) => fileSkills.some((f) => key(f.name) === key(s.name) && f.level === s.level);
  const off = new Set([...(before?.skillsRemoved ?? []).map(key), ...fileSkills.map((s) => key(s.name)).filter((n) => !inNext.has(n))]);
  for (const n of inNext) off.delete(n);
  return { skills: next.filter((s) => !fromFile(s)).slice(0, 60), skillsOwn: true, skillsRemoved: [...off].slice(0, 60) };
}
