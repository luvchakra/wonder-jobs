/**
 * WonderWorks Scholarships & Projects (owner, 2026-11-01; docs/WONDERWORKS_PLATFORM.md §4): what a scholarship or a
 * student project is, what a student tells us, what "you may be eligible" means and how an application moves. Pure, so
 * the server, the screens and the tests share it.
 *
 * Real data only: a term a listing doesn't state stays unstated ("Deadline not stated"), never guessed. Trust rules
 * from the doc, enforced here:
 * - No fee to apply, ever: a posted listing that asks for one is refused, and an outside listing that mentions an
 *   application fee is dropped (`asksForFee`).
 * - An official link is required (`officialLink`).
 * - Past-deadline listings never show (`stillOpen`).
 * - Matching says "you may be eligible", never a guarantee, and uses income, gender and category only when the student
 *   opted in (`matchScholarship`, `cleanProfile`).
 */
import type { WorkMode } from "@/wonderworks/find/place";
import { addDays, isDate, money, shortDate, WORK_MODE_LABEL } from "@/wonderworks/listing/terms";

export { isDate, shortDate, WORK_MODE_LABEL };

export const SCHOLARSHIPS = "scholarships" as const;

export type Kind = "scholarship" | "project";
export const KIND_LABEL: Record<Kind, string> = { scholarship: "Scholarship", project: "Project" };

export const LEVELS = ["school", "ug", "pg", "phd"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { school: "Class 9–12", ug: "Undergraduate", pg: "Postgraduate", phd: "PhD" };

export const PROVIDER_TYPES = ["government", "foundation", "csr", "university", "private"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
export const PROVIDER_LABEL: Record<ProviderType, string> = { government: "Government", foundation: "Foundation", csr: "Company CSR", university: "University", private: "Private" };

export type AwardPeriod = "one_time" | "per_year" | "per_month";
export const PERIOD_LABEL: Record<AwardPeriod, string> = { one_time: "one-time", per_year: "a year", per_month: "a month" };

export const CATEGORIES = ["SC", "ST", "OBC", "EWS", "Minority", "Person with disability"] as const;
export type Gender = "female" | "male" | "other";
export const GENDER_LABEL: Record<Gender, string> = { female: "Female", male: "Male", other: "Another gender" };
export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

/** One screening question an organisation asks (at most five). */
export interface Question {
  id: string;
  text: string;
  required: boolean;
}

/** A listing's own terms: a scholarship's award and eligibility, or a project's host terms. */
export interface ScholarshipTerms {
  kind: Kind;
  currency: string;
  /** YYYY-MM-DD: the last day to apply. */
  deadline?: string;
  /** The provider's or host's own page for it (https). */
  officialUrl?: string;
  levels?: Level[];
  fields?: string[];
  /** A state or country it's open to; unset is open everywhere it says. */
  region?: string;
  documents?: string[];
  // scholarship
  providerType?: ProviderType;
  awardAmount?: number;
  awardPeriod?: AwardPeriod;
  renewable?: boolean;
  /** Minimum marks, in percent. */
  minMarks?: number;
  /** A family income limit a year, in `currency`. */
  incomeLimit?: number;
  gender?: Gender;
  categories?: string[];
  // project
  /** A month's stipend; 0 is unpaid. */
  stipend?: number;
  durationWeeks?: number;
  teamSize?: number;
  deliverable?: string;
  mentor?: string;
  certificate?: boolean;
}

/** An organisation's posting (wonderjobs.listings, module = 'scholarships'). */
export interface ScholarshipPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  skills: string[];
  terms: ScholarshipTerms;
  questions: Question[];
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

/** One scholarship or project as Find shows it, from a WonderWorks organisation or an outside source. */
export interface ScholarshipListing {
  /** `ws_<postingId>` for a WonderWorks posting; the WorksLake opportunity id otherwise. */
  id: string;
  origin: "wonderstar" | "outside";
  postingId?: string;
  title: string;
  /** The provider (scholarship) or host (project). */
  company: string;
  companyDomain?: string;
  companyVerified?: boolean;
  location: string;
  workMode?: WorkMode;
  terms: ScholarshipTerms;
  termsFrom: "company" | "posting";
  skills: string[];
  description: string;
  /** A posted listing's screening questions. */
  questions?: Question[];
  /** Outside listings: the official page, where applying happens. */
  applyUrl?: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
  /** A notice the source's terms require next to its listings (Grants.gov). */
  notice?: string;
}

const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, each = 80) => (Array.isArray(v) ? [...new Set(v.map((s) => text(s, each)).filter(Boolean))].slice(0, max) : []);

/* ------------------------------------------------------------------ trust rules */

const FEE = /\b(application|applying|registration|processing|entry|enrol?ment|form|submission|admin(?:istration)?)[\s-]+(fee|fees|charges?)\b|\bfee\s+(?:to|for)\s+(?:apply|applying|register|registration)\b|\bpay\s+(?:₹|rs\.?|inr|\$|usd)?\s*\d[\d,]*\s*(?:to|for)\s+(?:apply|register)/gi;
const NO_FEE_BEFORE = /\b(no|without|zero|nil|free of|waived?|not charge|never charge|doesn't charge|does not charge|no need to pay|covers?|covering|pays? for|reimburs\w*|towards|support for)\b[^.;\n]{0,24}$/i;
const NO_FEE_AFTER = /^[^.;\n]{0,12}\b(waived|is nil|not required|free|none)\b/i;

/**
 * Whether a listing asks the student to pay to apply. "No application fee" and "the application fee is waived" don't
 * count; "Application fee: ₹500", "registration fees apply" and "pay ₹200 to apply" do.
 */
export function asksForFee(s: string): boolean {
  for (const m of s.matchAll(FEE)) {
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (NO_FEE_BEFORE.test(before) || NO_FEE_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

/** An official link: https, a real host, no credentials in it. Anything else is no link. */
export function officialLink(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** A listing whose deadline has passed is closed to students; Find leaves it out. */
export const stillOpen = (t: Pick<ScholarshipTerms, "deadline">, today = new Date().toISOString().slice(0, 10)) => !t.deadline || t.deadline >= today;

/** Days from today to the deadline (0 = closes today); undefined when none is stated. */
export function daysLeft(t: Pick<ScholarshipTerms, "deadline">, today = new Date().toISOString().slice(0, 10)): number | undefined {
  if (!t.deadline) return undefined;
  return Math.round((Date.parse(`${t.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/* ------------------------------------------------------------------ the organisation's form */

export interface PostingInput {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  location?: unknown;
  workMode?: unknown;
  skills?: unknown;
  currency?: unknown;
  deadline?: unknown;
  officialUrl?: unknown;
  levels?: unknown;
  fields?: unknown;
  region?: unknown;
  documents?: unknown;
  providerType?: unknown;
  awardAmount?: unknown;
  awardPeriod?: unknown;
  renewable?: unknown;
  minMarks?: unknown;
  incomeLimit?: unknown;
  gender?: unknown;
  categories?: unknown;
  stipend?: unknown;
  durationWeeks?: unknown;
  teamSize?: unknown;
  deliverable?: unknown;
  mentor?: unknown;
  certificate?: unknown;
  questions?: unknown;
  /** The organisation confirms applying is free. */
  noFee?: unknown;
}

export type CleanPosting = Pick<ScholarshipPosting, "title" | "description" | "location" | "workMode" | "skills" | "terms" | "questions">;

export function cleanQuestions(v: unknown): Question[] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((q, i) => {
      const r = q && typeof q === "object" ? (q as Record<string, unknown>) : {};
      const t = text(r.text, 300);
      return t ? [{ id: text(r.id, 40) || `q${i + 1}`, text: t, required: r.required === true }] : [];
    })
    .slice(0, 5);
}

/**
 * An organisation's scholarship or project, checked. Required: a title, a description, the kind, at least one level,
 * the deadline (today or later), the official link, and the confirmation that applying is free; a scholarship also
 * needs its award and provider type, a project its duration and stipend (0 for unpaid) and where it happens. A
 * listing whose text asks for a fee is refused.
 */
export function cleanPosting(i: PostingInput, today = new Date().toISOString().slice(0, 10)): { value: CleanPosting } | { problem: string } {
  const kind = i.kind === "scholarship" || i.kind === "project" ? i.kind : null;
  if (!kind) return { problem: "Say whether it's a scholarship or a project." };
  const title = text(i.title, 160);
  if (title.length < 3) return { problem: `Give the ${kind} a title.` };
  const description = text(i.description, 8000);
  if (description.length < 30) return { problem: `Describe the ${kind} in a few sentences (who it's for and what it gives).` };
  const questions = cleanQuestions(i.questions);
  const documents = list(i.documents, 12, 120);
  if (i.noFee !== true) return { problem: "Confirm that applying is free. WonderWorks never lists a scholarship or project that charges students to apply." };
  if (asksForFee([title, description, ...documents, ...questions.map((q) => q.text)].join("\n"))) return { problem: "This mentions a fee to apply. WonderWorks never lists a scholarship or project that charges students to apply." };
  const levels = list(i.levels, 4).filter((l): l is Level => (LEVELS as readonly string[]).includes(l));
  if (!levels.length) return { problem: "Choose who can apply (Class 9–12, Undergraduate, Postgraduate or PhD)." };
  if (!isDate(i.deadline)) return { problem: "Give the last day to apply." };
  if (i.deadline < today) return { problem: "The last day to apply has passed." };
  const officialUrl = officialLink(i.officialUrl);
  if (!officialUrl) return { problem: "Add the official link (an https page of your organisation about it)." };
  const currency = typeof i.currency === "string" && (CURRENCIES as readonly string[]).includes(i.currency) ? i.currency : null;
  if (!currency) return { problem: "Choose the currency." };
  const fields = list(i.fields, 10, 60);
  const region = text(i.region, 120);
  const skills = list(i.skills, 20, 60);
  const common: ScholarshipTerms = { kind, currency, deadline: i.deadline, officialUrl, levels, ...(fields.length ? { fields } : {}), ...(region ? { region } : {}), ...(documents.length ? { documents } : {}) };
  if (kind === "scholarship") {
    const providerType = (PROVIDER_TYPES as readonly unknown[]).includes(i.providerType) ? (i.providerType as ProviderType) : null;
    if (!providerType) return { problem: "Say who provides it (government, foundation, company CSR, university or private)." };
    const awardAmount = int(i.awardAmount, 1, 100_000_000);
    if (!awardAmount) return { problem: "Give the award amount." };
    const awardPeriod = i.awardPeriod === "one_time" || i.awardPeriod === "per_year" || i.awardPeriod === "per_month" ? i.awardPeriod : null;
    if (!awardPeriod) return { problem: "Say whether the award is one-time, a year or a month." };
    const minMarks = i.minMarks == null || i.minMarks === "" ? undefined : int(i.minMarks, 0, 100);
    if (i.minMarks != null && i.minMarks !== "" && minMarks === undefined) return { problem: "Minimum marks should be a percentage (0 to 100)." };
    const incomeLimit = i.incomeLimit == null || i.incomeLimit === "" ? undefined : int(i.incomeLimit, 1, 100_000_000);
    const gender = i.gender === "female" || i.gender === "male" || i.gender === "other" ? i.gender : undefined;
    const categories = list(i.categories, 6).filter((c) => (CATEGORIES as readonly string[]).includes(c));
    const terms: ScholarshipTerms = { ...common, providerType, awardAmount, awardPeriod, ...(i.renewable === true ? { renewable: true } : {}), ...(minMarks !== undefined ? { minMarks } : {}), ...(incomeLimit ? { incomeLimit } : {}), ...(gender ? { gender } : {}), ...(categories.length ? { categories } : {}) };
    return { value: { title, description, location: text(i.location, 160) || region || "", workMode: "remote", skills, terms, questions } };
  }
  const workMode = i.workMode === "remote" || i.workMode === "hybrid" || i.workMode === "onsite" ? i.workMode : null;
  if (!workMode) return { problem: "Say whether the project is remote, hybrid or on-site." };
  const location = text(i.location, 160);
  if (workMode !== "remote" && !location) return { problem: "Say where the project happens." };
  const durationWeeks = int(i.durationWeeks, 1, 104);
  if (!durationWeeks) return { problem: "Give the duration in weeks (1 to 104)." };
  const stipend = int(i.stipend, 0, 10_000_000);
  if (stipend === undefined) return { problem: "Give the stipend a month (0 for an unpaid project)." };
  const teamSize = i.teamSize == null || i.teamSize === "" ? undefined : int(i.teamSize, 1, 50);
  const deliverable = text(i.deliverable, 300);
  const mentor = text(i.mentor, 160);
  const terms: ScholarshipTerms = { ...common, durationWeeks, stipend, ...(teamSize ? { teamSize } : {}), ...(deliverable ? { deliverable } : {}), ...(mentor ? { mentor } : {}), ...(i.certificate === true ? { certificate: true } : {}) };
  return { value: { title, description, location: workMode === "remote" ? location || "Remote" : location, workMode, skills, terms, questions } };
}

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): ScholarshipTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind: Kind = r.kind === "project" ? "project" : "scholarship";
  const levels = list(r.levels, 4).filter((l): l is Level => (LEVELS as readonly string[]).includes(l));
  const officialUrl = officialLink(r.officialUrl);
  const fields = list(r.fields, 10, 60);
  const documents = list(r.documents, 12, 120);
  const categories = list(r.categories, 6);
  return {
    kind,
    currency: typeof r.currency === "string" ? r.currency : "INR",
    ...(isDate(r.deadline) ? { deadline: r.deadline } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(levels.length ? { levels } : {}),
    ...(fields.length ? { fields } : {}),
    ...(text(r.region, 120) ? { region: text(r.region, 120) } : {}),
    ...(documents.length ? { documents } : {}),
    ...((PROVIDER_TYPES as readonly unknown[]).includes(r.providerType) ? { providerType: r.providerType as ProviderType } : {}),
    ...(int(r.awardAmount, 1, 100_000_000) ? { awardAmount: r.awardAmount as number } : {}),
    ...(r.awardPeriod === "one_time" || r.awardPeriod === "per_year" || r.awardPeriod === "per_month" ? { awardPeriod: r.awardPeriod } : {}),
    ...(r.renewable === true ? { renewable: true } : {}),
    ...(int(r.minMarks, 0, 100) !== undefined ? { minMarks: r.minMarks as number } : {}),
    ...(int(r.incomeLimit, 1, 100_000_000) ? { incomeLimit: r.incomeLimit as number } : {}),
    ...(r.gender === "female" || r.gender === "male" || r.gender === "other" ? { gender: r.gender } : {}),
    ...(categories.length ? { categories } : {}),
    ...(int(r.stipend, 0, 10_000_000) !== undefined ? { stipend: r.stipend as number } : {}),
    ...(int(r.durationWeeks, 1, 104) ? { durationWeeks: r.durationWeeks as number } : {}),
    ...(int(r.teamSize, 1, 50) ? { teamSize: r.teamSize as number } : {}),
    ...(text(r.deliverable, 300) ? { deliverable: text(r.deliverable, 300) } : {}),
    ...(text(r.mentor, 160) ? { mentor: text(r.mentor, 160) } : {}),
    ...(r.certificate === true ? { certificate: true } : {}),
  };
}

/* ------------------------------------------------------------------ outside listings */

/** The level words a listing's own text uses; nothing when it names none. */
export function levelsFromText(s: string): Level[] {
  const out: Level[] = [];
  if (/\b(class|grade|std\.?|standard)\s*(9|10|11|12|ix|x|xi|xii)\b|\bhigh[\s-]school\b|\bsecondary school\b|\bschool students?\b|\bpost[\s-]matric|\bpre[\s-]matric/i.test(s)) out.push("school");
  if (/\bunder[\s-]?graduate|\bbachelor|\bb\.?\s?(tech|sc|com|a|e)\b|\bcollege students?\b|\bug\b/i.test(s)) out.push("ug");
  if (/\bpost[\s-]?graduate|\bmaster'?s?\b|\bm\.?\s?(tech|sc|com|a|ba)\b|\bpg\b|\bgraduate students?\b/i.test(s)) out.push("pg");
  if (/\bph\.?\s?d\b|\bdoctoral\b|\bdoctorate\b|\bpostdoc/i.test(s)) out.push("phd");
  return out;
}

/** Whether an outside listing reads as a project rather than a scholarship. */
export const isProjectText = (s: string) => /\b(project|capstone|research assistant|hackathon|challenge|fellowship project|live project)\b/i.test(s) && !/\bscholarship\b/i.test(s);

/* ------------------------------------------------------------------ display */

/** "₹50,000 a year", "₹10,000 one-time · renewable", or "Award not stated". */
export function awardLabel(t: Pick<ScholarshipTerms, "awardAmount" | "awardPeriod" | "renewable" | "currency">): string {
  if (!t.awardAmount) return "Award not stated";
  return `${money(t.awardAmount, t.currency)}${t.awardPeriod ? ` ${PERIOD_LABEL[t.awardPeriod]}` : ""}${t.renewable ? " · renewable" : ""}`;
}

/** "₹8,000 a month", "Unpaid", or "Stipend not stated". */
export function stipendLabel(t: Pick<ScholarshipTerms, "stipend" | "currency">): string {
  if (t.stipend === undefined) return "Stipend not stated";
  return t.stipend === 0 ? "Unpaid" : `${money(t.stipend, t.currency)} a month`;
}

/** What it gives: a scholarship's award or a project's stipend. */
export const valueLabel = (t: ScholarshipTerms) => (t.kind === "project" ? stipendLabel(t) : awardLabel(t));

/** "Closes today", "Closes in 12 days", "Closes 3 Mar 2027", or "Deadline not stated". */
export function deadlineLabel(t: Pick<ScholarshipTerms, "deadline">, today = new Date().toISOString().slice(0, 10)): string {
  const d = daysLeft(t, today);
  if (d === undefined) return "Deadline not stated";
  if (d < 0) return `Closed ${shortDate(t.deadline!)}`;
  if (d === 0) return "Closes today";
  if (d === 1) return "Closes tomorrow";
  return d <= 60 ? `Closes in ${d} days` : `Closes ${shortDate(t.deadline!)}`;
}

export const levelsLabel = (t: Pick<ScholarshipTerms, "levels">) => (t.levels?.length ? t.levels.map((l) => LEVEL_LABEL[l]).join(", ") : "Level not stated");

export const durationLabel = (t: Pick<ScholarshipTerms, "durationWeeks">) => (t.durationWeeks ? `${t.durationWeeks} ${t.durationWeeks === 1 ? "week" : "weeks"}` : "Duration not stated");

/* ------------------------------------------------------------------ the student */

/**
 * The student's profile (You → Scholarships & Projects). Income band, gender and category are optional and kept only
 * with `sensitiveConsent`: used only to match, never inferred, never sent to a provider unless the student ticks
 * "Share with the provider" when applying.
 */
export interface StudentProfile {
  level?: Level;
  field: string;
  institution: string;
  /** A state, or a state and country (optional: nothing is ever limited by place). */
  region: string;
  /** Latest marks, in percent. */
  marks?: number;
  /** A parent or guardian agreed (required for Class 9–12 before applying through WonderWorks). */
  guardianConsent?: boolean;
  sensitiveConsent?: boolean;
  incomeBand?: number;
  gender?: Gender;
  category?: string;
}

export const EMPTY_PROFILE: StudentProfile = { field: "", institution: "", region: "" };

/** What the profile still needs before an application can go. */
export function missingProfile(p: StudentProfile | undefined): string[] {
  const out: string[] = [];
  if (!p?.level) out.push("level");
  if (!p?.field.trim()) out.push("course or field");
  if (!p?.institution.trim()) out.push("school or college");
  if (p?.level === "school" && !p.guardianConsent) out.push("a parent's or guardian's consent");
  return out;
}

/** The profile, checked. Sensitive fields are dropped unless the student opted in. */
export function cleanProfile(raw: unknown): { value: StudentProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const level = (LEVELS as readonly unknown[]).includes(r.level) ? (r.level as Level) : undefined;
  if (!level) return { problem: "Choose your level (Class 9–12, Undergraduate, Postgraduate or PhD)." };
  const field = text(r.field, 160);
  const institution = text(r.institution, 160);
  const region = text(r.region, 160);
  if (!field || !institution) return { problem: "Add your course or field, and your school or college." };
  const marks = r.marks == null || r.marks === "" ? undefined : int(r.marks, 0, 100);
  if (r.marks != null && r.marks !== "" && marks === undefined) return { problem: "Marks should be a percentage (0 to 100)." };
  if (level === "school" && r.guardianConsent !== true) return { problem: "Class 9–12 students need a parent's or guardian's consent first." };
  const out: StudentProfile = { level, field, institution, region, ...(marks !== undefined ? { marks } : {}), ...(r.guardianConsent === true ? { guardianConsent: true } : {}) };
  if (r.sensitiveConsent === true) {
    const incomeBand = int(r.incomeBand, 0, 100_000_000);
    const gender = r.gender === "female" || r.gender === "male" || r.gender === "other" ? r.gender : undefined;
    const category = (CATEGORIES as readonly unknown[]).includes(r.category) ? (r.category as string) : undefined;
    Object.assign(out, { sensitiveConsent: true }, incomeBand !== undefined ? { incomeBand } : {}, gender ? { gender } : {}, category ? { category } : {});
  }
  return { value: out };
}

/** What a provider receives: never income, gender or category unless the student chose to share them for this one. */
export function profileForProvider(p: StudentProfile, share: boolean): StudentProfile {
  const { incomeBand, gender, category, sensitiveConsent, ...rest } = p;
  return share && sensitiveConsent ? { ...rest, ...(incomeBand !== undefined ? { incomeBand } : {}), ...(gender ? { gender } : {}), ...(category ? { category } : {}) } : rest;
}

/* ------------------------------------------------------------------ "you may be eligible" */

export interface MatchSignal {
  tone: "good" | "bad";
  text: string;
}

export interface ScholarshipMatch {
  /** "may": nothing stated rules them out and at least one stated rule fits. Never a guarantee. */
  fit: "may" | "unlikely" | "unknown";
  signals: MatchSignal[];
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2);

/**
 * Whether the student may be eligible, and why — computed only from the listing's stated rules and the student's own
 * profile. A rule the listing doesn't state gives no signal. Income, gender and category count only when the student
 * opted in; without that, a listing restricted by them says so instead of guessing.
 */
export function matchScholarship(l: Pick<ScholarshipListing, "title" | "description" | "skills" | "terms" | "location">, p: StudentProfile | undefined | null): ScholarshipMatch {
  const signals: MatchSignal[] = [];
  if (!p) return { fit: "unknown", signals };
  const t = l.terms;
  if (t.levels?.length && p.level) {
    if (t.levels.includes(p.level)) signals.push({ tone: "good", text: `Open to ${LEVEL_LABEL[p.level]} students` });
    else signals.push({ tone: "bad", text: `For ${levelsLabel(t)} students` });
  }
  if (p.field) {
    const mine = words(p.field).filter((w) => !["bachelor", "master", "degree", "and", "the", "of", "in", "class"].includes(w));
    const theirs = new Set(words([...(t.fields ?? []), l.title, ...l.skills].join(" ")));
    if (mine.some((w) => theirs.has(w))) signals.push({ tone: "good", text: `In your field (${p.field})` });
  }
  if (t.minMarks !== undefined && p.marks !== undefined) {
    signals.push(p.marks >= t.minMarks ? { tone: "good", text: `Asks for ${t.minMarks}% — you have ${p.marks}%` } : { tone: "bad", text: `Asks for at least ${t.minMarks}% marks` });
  }
  if (t.region && p.region) {
    const rw = words(t.region);
    if (rw.some((w) => words(p.region).includes(w))) signals.push({ tone: "good", text: `Open in ${t.region}` });
  }
  if (p.sensitiveConsent) {
    if (t.incomeLimit !== undefined && p.incomeBand !== undefined) signals.push(p.incomeBand <= t.incomeLimit ? { tone: "good", text: `Family income under ${money(t.incomeLimit, t.currency)}` } : { tone: "bad", text: `Family income limit ${money(t.incomeLimit, t.currency)}` });
    if (t.gender && p.gender) signals.push(t.gender === p.gender ? { tone: "good", text: `For ${GENDER_LABEL[t.gender].toLowerCase()} students` } : { tone: "bad", text: `Only for ${GENDER_LABEL[t.gender].toLowerCase()} students` });
    if (t.categories?.length && p.category) signals.push(t.categories.includes(p.category) ? { tone: "good", text: `Open to ${p.category} students` } : { tone: "bad", text: `Only for ${t.categories.join(", ")} students` });
  }
  const good = signals.some((s) => s.tone === "good");
  const bad = signals.some((s) => s.tone === "bad");
  return { fit: bad ? "unlikely" : good ? "may" : "unknown", signals };
}

/** The one line a card shows: "You may be eligible", never a promise. */
export const fitLabel = (m: ScholarshipMatch) => (m.fit === "may" ? "You may be eligible" : m.fit === "unlikely" ? "Check eligibility" : "");

/* ------------------------------------------------------------------ Refine */

export type DeadlineWindow = "7" | "30" | "90";

export interface Facets {
  kind?: Kind;
  level?: Level;
  /** A word in its fields or title. */
  field?: string;
  /** Closes within this many days (from today). */
  closesWithin?: DeadlineWindow;
  /** At least this award (scholarships, in the listing's currency); a listing that states none is left out. */
  minAward?: number;
  /** A word in its region or location. */
  region?: string;
  remoteOnly?: boolean;
  /** Projects: only paid ones. */
  paidOnly?: boolean;
}

export const facetCount = (f: Facets) => [f.kind, f.level, f.field, f.closesWithin, f.minAward, f.region, f.remoteOnly || undefined, f.paidOnly || undefined].filter((v) => v !== undefined && v !== "").length;

/** The listings Refine keeps, and how many it left out (so an empty result can say why). */
export function applyFacets<T extends Pick<ScholarshipListing, "terms" | "workMode" | "title" | "location">>(list: T[], f: Facets, today = new Date().toISOString().slice(0, 10)): { kept: T[]; hidden: number } {
  const until = f.closesWithin ? addDays(today, Number(f.closesWithin)) : undefined;
  const fieldWords = f.field ? words(f.field) : [];
  const regionWords = f.region ? words(f.region) : [];
  const kept = list.filter((l) => {
    const t = l.terms;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.level && !(t.levels ?? []).includes(f.level)) return false;
    if (fieldWords.length) {
      const hay = new Set(words([...(t.fields ?? []), l.title].join(" ")));
      if (!fieldWords.some((w) => hay.has(w))) return false;
    }
    if (until && (!t.deadline || t.deadline > until)) return false;
    if (f.minAward && f.minAward > 0 && (t.kind !== "scholarship" || (t.awardAmount ?? 0) < f.minAward)) return false;
    if (regionWords.length) {
      const hay = new Set(words(`${t.region ?? ""} ${l.location}`));
      if (!regionWords.some((w) => hay.has(w))) return false;
    }
    if (f.remoteOnly && l.workMode !== "remote") return false;
    if (f.paidOnly && !(t.kind === "project" && (t.stipend ?? 0) > 0)) return false;
    return true;
  });
  return { kept, hidden: list.length - kept.length };
}

/* ------------------------------------------------------------------ applications */

/**
 * An application's status. Stored in the shared `responses` table, whose status check already allows these values:
 * accepted = Awarded / Selected, done = Completed, declined = Not selected.
 */
export type ScholarshipStatus = "applied" | "shortlisted" | "accepted" | "done" | "declined" | "withdrawn";
export const STATUS_LABEL: Record<ScholarshipStatus, string> = { applied: "Applied", shortlisted: "Shortlisted", accepted: "Awarded / Selected", done: "Completed", declined: "Not selected", withdrawn: "Withdrawn" };

/** Where the organisation may move an application. */
export const PROVIDER_NEXT: Record<ScholarshipStatus, ScholarshipStatus[]> = {
  applied: ["shortlisted", "accepted", "declined"],
  shortlisted: ["accepted", "declined"],
  accepted: ["done"],
  done: [],
  declined: [],
  withdrawn: [],
};

export const canWithdraw = (s: ScholarshipStatus) => s === "applied" || s === "shortlisted";

/** The Pipeline stages, in order (manifest `pipeline.stages`). */
export type Stage = "saved" | "preparing" | "applied" | "shortlisted" | "awarded_selected" | "completed";

/** The stage a status sits in. Not selected and Withdrawn stay where they ended, as a chip, under Applied. */
export function stageOf(s: ScholarshipStatus): Stage {
  if (s === "shortlisted") return "shortlisted";
  if (s === "accepted") return "awarded_selected";
  if (s === "done") return "completed";
  return "applied";
}

/** The student's own record of one applied to on the provider's site: Preparing, Applied, or the outcome they report. */
export type OutsideStatus = "preparing" | "applied" | "shortlisted" | "awarded" | "completed" | "not_selected" | "withdrawn";
export const OUTSIDE_LABEL: Record<OutsideStatus, string> = { preparing: "Preparing", applied: "Applied on their site", shortlisted: "Shortlisted", awarded: "Awarded / Selected", completed: "Completed", not_selected: "Not selected", withdrawn: "Withdrawn" };
export const OUTSIDE_STAGE: Record<OutsideStatus, Stage> = { preparing: "preparing", applied: "applied", shortlisted: "shortlisted", awarded: "awarded_selected", completed: "completed", not_selected: "applied", withdrawn: "applied" };
export const OUTSIDE_STATUSES = Object.keys(OUTSIDE_LABEL) as OutsideStatus[];

export function outsideStatus(ref: { stage: string; status?: string } | undefined): OutsideStatus | null {
  if (!ref) return null;
  if (ref.status && (OUTSIDE_STATUSES as string[]).includes(ref.status)) return ref.status as OutsideStatus;
  return ref.stage === "preparing" ? "preparing" : "applied";
}

export interface MyScholarshipApplication {
  id: string;
  postingId: string;
  title: string;
  company: string;
  status: ScholarshipStatus;
  terms: ScholarshipTerms;
  appliedAt: string;
  updatedAt: string;
}

export interface MyScholarshipApplicationDetail extends MyScholarshipApplication {
  location: string;
  workMode: WorkMode;
  description: string;
  sent: { name: string; email: string; profile: StudentProfile; answers: { question: string; answer: string }[]; statement: string; resume?: string };
  events: { id: string; status: ScholarshipStatus; detail?: string; at: string }[];
}

/** One application as the organisation sees it. */
export interface ScholarshipApplicationView {
  id: string;
  postingId: string;
  postingTitle: string;
  name: string;
  email: string;
  status: ScholarshipStatus;
  profile: StudentProfile;
  answers: { question: string; answer: string }[];
  statement: string;
  hasResume: boolean;
  appliedAt: string;
  updatedAt: string;
}

/** Deadlines: what closes when, among the saved ones not yet applied to, soonest first, from today. */
export function deadlines(saved: Pick<ScholarshipListing, "id" | "title" | "company" | "terms">[], appliedIds: Set<string>, today = new Date().toISOString().slice(0, 10)) {
  return saved
    .filter((s) => s.terms.deadline && s.terms.deadline >= today && !appliedIds.has(s.id))
    .map((s) => ({ id: s.id, date: s.terms.deadline!, label: deadlineLabel(s.terms, today), title: s.title, company: s.company, kind: s.terms.kind }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Answers to an organisation's questions, checked: every required one answered, nothing else kept. */
export function cleanAnswers(questions: Question[], raw: unknown): { value: { question: string; answer: string }[] } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: { question: string; answer: string }[] = [];
  for (const q of questions) {
    const a = text(r[q.id], 2000);
    if (q.required && !a) return { problem: `Answer: ${q.text}` };
    if (a) out.push({ question: q.text, answer: a });
  }
  return { value: out };
}
