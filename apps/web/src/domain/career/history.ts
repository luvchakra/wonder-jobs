/**
 * The candidate's career history — the facts a résumé is made of. Stored once, in the Career
 * Profile, and only ever written by the candidate (typed in, or accepted from their own résumé
 * import). Résumé templates read it; nothing that renders a résumé may add to it.
 *
 * Every entry records where it came from, so a rendered résumé can say which facts were typed and
 * which were imported — and an AI draft can never pass itself off as one of them.
 */

export type FactProvenance = "USER_PROVIDED" | "RESUME_IMPORTED" | "LINKEDIN_IMPORTED" | "USER_CONFIRMED";

export const FACT_PROVENANCE_LABEL: Record<FactProvenance, string> = {
  USER_PROVIDED: "Typed by you",
  RESUME_IMPORTED: "From your résumé",
  LINKEDIN_IMPORTED: "From LinkedIn",
  USER_CONFIRMED: "Confirmed by you",
};

export interface CareerContact {
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;
}

export interface CareerBullet {
  id: string;
  text: string;
  provenance: FactProvenance;
}

export interface CareerExperience {
  id: string;
  employer: string;
  title: string;
  location?: string;
  /** "YYYY-MM" or "YYYY". */
  startDate: string;
  endDate?: string;
  current?: boolean;
  summary?: string;
  bullets: CareerBullet[];
  provenance: FactProvenance;
}

export interface CareerEducation {
  id: string;
  institution: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  honors?: string[];
  provenance: FactProvenance;
}

export interface CareerCertification {
  id: string;
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
  provenance: FactProvenance;
}

export interface CareerProject {
  id: string;
  name: string;
  description?: string;
  technologies?: string[];
  url?: string;
  bullets?: CareerBullet[];
  provenance: FactProvenance;
}

export interface CareerPublication {
  id: string;
  title: string;
  publication?: string;
  date?: string;
  authors?: string[];
  url?: string;
  provenance: FactProvenance;
}

export interface CareerHistory {
  contact: CareerContact;
  /** The candidate's own professional summary, in their words. */
  summary?: string;
  experience: CareerExperience[];
  education: CareerEducation[];
  certifications: CareerCertification[];
  projects: CareerProject[];
  publications: CareerPublication[];
  researchInterests: string[];
}

export const EMPTY_HISTORY: CareerHistory = { contact: {}, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] };

/** Tolerates profiles saved before history existed, and partially filled ones. */
export function historyOf(dna: { history?: Partial<CareerHistory> }): CareerHistory {
  const h = dna.history ?? {};
  return {
    contact: h.contact ?? {},
    summary: h.summary,
    experience: h.experience ?? [],
    education: h.education ?? [],
    certifications: h.certifications ?? [],
    projects: h.projects ?? [],
    publications: h.publications ?? [],
    researchInterests: h.researchInterests ?? [],
  };
}

/* ------------------------------------------------------------------ dates */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2023-01" → "Jan 2023", "2019" → "2019"; anything else is shown as typed. */
export function formatMonth(v: string | undefined): string {
  if (!v) return "";
  const m = v.trim().match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!m) return v.trim();
  return m[2] ? `${MONTHS[Math.min(12, Math.max(1, Number(m[2]))) - 1]} ${m[1]}` : m[1];
}

export function formatRange(start: string | undefined, end: string | undefined, current?: boolean): string {
  const a = formatMonth(start);
  const b = current ? "Present" : formatMonth(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

/** Sortable key for "YYYY-MM"/"YYYY"; unknown sorts last. */
function sortKey(v: string | undefined): string {
  const m = v?.match(/^(\d{4})(?:-(\d{1,2}))?/);
  return m ? `${m[1]}-${(m[2] ?? "00").padStart(2, "0")}` : "0000-00";
}

/** Most recent first: current roles, then by end date, then by start date. */
export function sortExperience<T extends { startDate?: string; endDate?: string; current?: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(!!b.current) - Number(!!a.current) || sortKey(b.endDate ?? b.startDate).localeCompare(sortKey(a.endDate ?? a.startDate)) || sortKey(b.startDate).localeCompare(sortKey(a.startDate)));
}

/* ------------------------------------------------------------ validation */

export const isEmail = (v: string) => /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(v.trim());
export const isPhone = (v: string) => /^\+?[\d\s().-]{7,20}$/.test(v.trim()) && (v.match(/\d/g) ?? []).length >= 7;
export function isHttpUrl(v: string) {
  try {
    const u = new URL(v.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}
export const isMonth = (v: string) => /^\d{4}(-(0?[1-9]|1[0-2]))?$/.test(v.trim());

/** Normalizes what a candidate types for a link ("linkedin.com/in/x" → "https://linkedin.com/in/x"). */
export function normalizeUrl(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
