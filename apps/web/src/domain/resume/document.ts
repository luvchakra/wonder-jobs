/**
 * ResumeDocument (spec §17–24): the structured résumé every template renders. Built only from the
 * candidate's Career Profile. For a target job the builder may *select and order* the candidate's
 * facts — it never adds one — so the same document renders identically in all eight templates and a
 * template change can't alter a fact (spec §77, CROSS-002…005).
 */
import type { CareerDNA } from "@/domain/career/types";
import { historyOf, sortExperience, type FactProvenance } from "@/domain/career/history";

export type ResumeSectionType =
  | "summary"
  | "strengths"
  | "skills"
  | "experience"
  | "selected_achievements"
  | "transferable_skills"
  | "education"
  | "certifications"
  | "projects"
  | "publications"
  | "research_interests";

export type BulletProvenance = FactProvenance | "VERIFIED" | "DERIVED";

export interface ResumeBullet {
  text: string;
  /** Ids of the Career Profile facts this bullet is — every bullet is one of the candidate's own. */
  evidenceIds: string[];
  provenance: BulletProvenance;
}

export interface ResumeHeader {
  name: string;
  headline?: string;
  location?: string;
  phone?: string;
  email?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;
}

export interface ResumeExperience {
  id: string;
  employer: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  summary?: string;
  bullets: ResumeBullet[];
}

export interface ResumeEducation {
  id: string;
  institution: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  honors?: string[];
}

export interface ResumeSkillGroup {
  name: string;
  skills: string[];
}

export interface ResumeCertification {
  id: string;
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

export interface ResumeProject {
  id: string;
  name: string;
  description?: string;
  technologies?: string[];
  url?: string;
  bullets?: ResumeBullet[];
}

export interface ResumePublication {
  id: string;
  title: string;
  publication?: string;
  date?: string;
  authors?: string[];
  url?: string;
}

export type ResumeSection =
  | { type: "summary"; text: string }
  | { type: "strengths"; items: string[] }
  | { type: "skills"; groups: ResumeSkillGroup[]; /** The same skills in the candidate's order (strongest, or most relevant to the target, first). Older snapshots lack it. */ ordered?: string[] }
  | { type: "experience"; items: ResumeExperience[] }
  | { type: "selected_achievements"; items: ResumeBullet[] }
  | { type: "transferable_skills"; items: string[] }
  | { type: "education"; items: ResumeEducation[] }
  | { type: "certifications"; items: ResumeCertification[] }
  | { type: "projects"; items: ResumeProject[] }
  | { type: "publications"; items: ResumePublication[] }
  | { type: "research_interests"; items: string[] };

export interface ResumeDocument {
  version: 1;
  header: ResumeHeader;
  /** Every section with content; templates choose which to show and in what order. Empty sections never exist. */
  sections: ResumeSection[];
  target?: { jobId: string; title: string; company: string };
  metadata: { builtAt: string; careerProfileUpdatedAt: string };
}

export type SectionOf<T extends ResumeSectionType> = Extract<ResumeSection, { type: T }>;

export function sectionOf<T extends ResumeSectionType>(doc: ResumeDocument, type: T): SectionOf<T> | undefined {
  return doc.sections.find((s) => s.type === type) as SectionOf<T> | undefined;
}

/* ----------------------------------------------------------- skill groups */

const GROUPS: [string, RegExp][] = [
  ["Languages", /^(python|java|javascript|typescript|go|golang|rust|c\/c\+\+|c\+\+|c#|c|ruby|php|kotlin|swift|scala|sql|r|bash|shell|powershell|perl|dart|elixir|objective-c|matlab|haskell|lua)$/i],
  ["Cloud", /\b(aws|azure|gcp|google cloud|cloud|kubernetes|k8s|docker|terraform|serverless|lambda|openshift|helm|ansible|ci\/cd|devops)\b/i],
  ["Security", /\b(security|iam|identity|access management|access governance|sailpoint|saviynt|cyberark|okta|oracle iam|siem|soc|zero[\s-]trust|pam|sso|oauth|pki|firewall|vulnerability|compliance|grc|iso 27001|nist)\b/i],
  ["Frameworks", /\b(react|next\.?js|angular|vue|django|flask|spring|rails|node\.?js|express|\.net|fastapi|laravel|pytorch|tensorflow|grpc|graphql|rest(ful)?( apis?)?)\b/i],
  ["Data", /\b(data|analytics|sql|postgres(ql)?|mysql|mongodb|redis|cassandra|dynamodb|elasticsearch|nosql|spark|hadoop|kafka|rabbitmq|snowflake|bigquery|tableau|power bi|looker|dbt|etl|machine learning|ml|ai|statistics)\b/i],
  ["Platforms", /\b(salesforce|sap|servicenow|workday|jira|confluence|github|gitlab|linux|windows server|oracle)\b/i],
];

/** Groups the candidate's own skills for the Technical template; only groups with members appear. */
export function groupSkills(skills: string[]): ResumeSkillGroup[] {
  const groups = new Map<string, string[]>();
  for (const s of skills) {
    const g = GROUPS.find(([, re]) => re.test(s))?.[0] ?? "Other";
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const order = [...GROUPS.map(([n]) => n), "Other"];
  // With nothing technical to group, the one group is just "Skills"; otherwise the rest are "Other".
  return order.filter((n) => groups.has(n)).map((n) => ({ name: n !== "Other" ? n : groups.size === 1 ? "Skills" : "Other", skills: groups.get(n)! }));
}

/* ---------------------------------------------------------------- build */

export interface TargetJob {
  id: string;
  title: string;
  company: string;
  description?: string;
  skills?: string[];
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z][a-z+#.]{1,}/g) ?? []);
function relevance(text: string, target: Set<string>) {
  if (!target.size) return 0;
  let n = 0;
  for (const w of words(text)) if (target.has(w)) n++;
  return n;
}
/** Stable sort by relevance to the target — order changes, content never does. */
function byRelevance<T>(items: T[], text: (t: T) => string, target: Set<string>): T[] {
  return items.map((item, i) => ({ item, i, r: relevance(text(item), target) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.item);
}

/**
 * A bullet's own text without the list marker a candidate typed or pasted ("• Led…", "- Ran…"): the
 * template draws the marker, so keeping theirs would print two. Formatting only — no word changes.
 */
export function stripListMarker(s: string): string {
  return s.replace(/^\s*(?:[•·▪▫●◦‣∙○■□◆◇➢➤►▶▸✓✔☐☑]\s*|[-–—*>]\s+|\d{1,2}[.)]\s+)+/u, "").trim();
}

export function buildResumeDocument(dna: CareerDNA, opts: { target?: TargetJob; now?: string } = {}): ResumeDocument {
  const h = historyOf(dna);
  const target = opts.target ? words(`${opts.target.title} ${opts.target.description ?? ""} ${(opts.target.skills ?? []).join(" ")}`) : new Set<string>();
  const skillsByLevel = [...dna.skills].sort((a, b) => b.level - a.level).map((s) => s.name);
  const skills = opts.target ? byRelevance(skillsByLevel, (s) => s, target) : skillsByLevel;
  const sections: ResumeSection[] = [];
  const clean = (s: string | undefined) => (s ?? "").trim();

  if (clean(h.summary)) sections.push({ type: "summary", text: clean(h.summary) });
  const item = (s: string | undefined) => stripListMarker(clean(s));
  const strengths = dna.strengths.map(item).filter(Boolean);
  if (strengths.length) sections.push({ type: "strengths", items: strengths });
  if (skills.length) sections.push({ type: "skills", groups: groupSkills(skills), ordered: skills });

  const experience = sortExperience(h.experience.filter((e) => clean(e.employer) && clean(e.title))).map((e) => {
    const bullets = e.bullets.filter((b) => item(b.text)).map((b) => ({ text: item(b.text), evidenceIds: [b.id], provenance: b.provenance }) satisfies ResumeBullet);
    return { id: e.id, employer: clean(e.employer), title: clean(e.title), location: clean(e.location) || undefined, startDate: clean(e.startDate), endDate: e.current ? undefined : clean(e.endDate) || undefined, current: !!e.current, summary: clean(e.summary) || undefined, bullets: opts.target ? byRelevance(bullets, (b) => b.text, target) : bullets } satisfies ResumeExperience;
  });
  if (experience.length) {
    sections.push({ type: "experience", items: experience });
    // The candidate's own bullets that best fit the target (or their most recent), for Career Shift —
    // at most two per role, and never a role's last one, so every role keeps its own detail when these
    // aren't repeated under it.
    const cap = new Map(experience.map((e) => [e.id, Math.min(2, e.bullets.length - 1)]));
    const all = experience.flatMap((e) => e.bullets.map((b, i) => ({ b, role: e.id, i })));
    const ranked = opts.target ? byRelevance(all, (x) => x.b.text, target) : [...all].sort((a, z) => a.i - z.i);
    const perRole = new Map<string, number>();
    const picked: ResumeBullet[] = [];
    for (const x of ranked) {
      if (picked.length === 5) break;
      if ((perRole.get(x.role) ?? 0) >= (cap.get(x.role) ?? 0)) continue;
      perRole.set(x.role, (perRole.get(x.role) ?? 0) + 1);
      picked.push(x.b);
    }
    if (picked.length) sections.push({ type: "selected_achievements", items: picked });
  }
  // Transferable = the candidate's skills rated 3+ (their own rating), most relevant first.
  const transferable = (opts.target ? byRelevance(dna.skills.filter((s) => s.level >= 3), (s) => s.name, target) : dna.skills.filter((s) => s.level >= 3)).map((s) => s.name);
  if (transferable.length) sections.push({ type: "transferable_skills", items: transferable.slice(0, 12) });

  const education = h.education.filter((e) => clean(e.institution)).map((e) => ({ id: e.id, institution: clean(e.institution), degree: clean(e.degree) || undefined, field: clean(e.field) || undefined, location: clean(e.location) || undefined, startDate: clean(e.startDate) || undefined, endDate: clean(e.endDate) || undefined, honors: e.honors?.map(clean).filter(Boolean) }));
  if (education.length) sections.push({ type: "education", items: sortExperience(education) });
  const certifications = h.certifications.filter((c) => clean(c.name)).map((c) => ({ id: c.id, name: clean(c.name), issuer: clean(c.issuer) || undefined, issueDate: clean(c.issueDate) || undefined, expiryDate: clean(c.expiryDate) || undefined, credentialId: clean(c.credentialId) || undefined, url: clean(c.url) || undefined }));
  if (certifications.length) sections.push({ type: "certifications", items: certifications });
  const projects = h.projects.filter((p) => clean(p.name)).map((p) => ({ id: p.id, name: clean(p.name), description: clean(p.description) || undefined, technologies: p.technologies?.map(clean).filter(Boolean), url: clean(p.url) || undefined, bullets: p.bullets?.filter((b) => item(b.text)).map((b) => ({ text: item(b.text), evidenceIds: [b.id], provenance: b.provenance })) }));
  if (projects.length) sections.push({ type: "projects", items: opts.target ? byRelevance(projects, (p) => `${p.name} ${p.description ?? ""} ${(p.technologies ?? []).join(" ")}`, target) : projects });
  const publications = h.publications.filter((p) => clean(p.title)).map((p) => ({ id: p.id, title: clean(p.title), publication: clean(p.publication) || undefined, date: clean(p.date) || undefined, authors: p.authors?.map(clean).filter(Boolean), url: clean(p.url) || undefined }));
  if (publications.length) sections.push({ type: "publications", items: publications });
  const interests = h.researchInterests.map(clean).filter(Boolean);
  if (interests.length) sections.push({ type: "research_interests", items: interests });

  const c = h.contact;
  return {
    version: 1,
    header: {
      name: clean(dna.name),
      headline: clean(dna.headline) || undefined,
      location: clean(c.location) || undefined,
      phone: clean(c.phone) || undefined,
      email: clean(c.email) || undefined,
      linkedinUrl: clean(c.linkedinUrl) || undefined,
      portfolioUrl: clean(c.portfolioUrl) || undefined,
      websiteUrl: clean(c.websiteUrl) || undefined,
    },
    sections,
    target: opts.target ? { jobId: opts.target.id, title: opts.target.title, company: opts.target.company } : undefined,
    metadata: { builtAt: opts.now ?? new Date().toISOString(), careerProfileUpdatedAt: dna.updatedAt },
  };
}

/** Every fact in a document, as text — for checking that templates neither add nor lose any (CROSS-002/005). */
export function factsOf(doc: ResumeDocument): string[] {
  const out: string[] = [doc.header.name];
  for (const s of doc.sections) {
    if (s.type === "experience") for (const e of s.items) out.push(e.employer, e.title, e.startDate, ...e.bullets.map((b) => b.text));
    if (s.type === "education") for (const e of s.items) out.push(e.institution);
    if (s.type === "certifications") for (const c of s.items) out.push(c.name);
  }
  return out.filter(Boolean);
}
