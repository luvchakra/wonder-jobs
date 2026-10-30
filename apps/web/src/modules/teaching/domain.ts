/**
 * WonderWorks Teaching (docs/WONDERWORKS_PLATFORM.md §4, step 6): what a teaching opening is, what a teacher tells us,
 * what "fits" means and how Refine narrows the results. Pure, so the server, the Teaching screens and the tests share it.
 *
 * Real data only: a term a posting doesn't state stays unstated ("Pay not stated"), never guessed. An outside posting's
 * subject, grades, board and required qualifications are only what its own title and text say; a match signal is only
 * ever computed from the posting and the teacher's own profile, and always says why.
 */
import type { WorkMode } from "@/wonderworks/find/place";
import { money, monthlyFromYearly, shortDate, WORK_MODE_LABEL } from "@/wonderworks/listing/terms";

export { shortDate, WORK_MODE_LABEL };

export const TEACHING = "teaching" as const;

/** The boards Indian schools teach to, and the international ones. */
export const BOARDS = ["CBSE", "ICSE", "State board", "IB", "Cambridge"] as const;
export type Board = (typeof BOARDS)[number];

/** Grade levels as schools hire for them (PRT, TGT, PGT and college map onto these). */
export const GRADES = ["pre_primary", "primary", "middle", "secondary", "senior", "college"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { pre_primary: "Pre-primary", primary: "Primary (1–5)", middle: "Middle (6–8)", secondary: "Secondary (9–10)", senior: "Senior secondary (11–12)", college: "College" };

/** The qualifications teaching posts ask for. */
export const QUALIFICATIONS = ["B.Ed", "CTET", "State TET", "M.Ed", "UGC NET", "PhD"] as const;

export type Hours = "full_time" | "part_time" | "tuition";
export const HOURS_LABEL: Record<Hours, string> = { full_time: "Full time", part_time: "Part time", tuition: "Tuition" };

export type PayPer = "month" | "hour";

/** An opening's own terms, as far as it states them. */
export interface TeachingTerms {
  subject?: string;
  grades?: Grade[];
  boards?: Board[];
  hours?: Hours;
  /** What the post asks the teacher to hold. */
  requires?: string[];
  payMin?: number;
  payMax?: number;
  currency: string;
  payPer?: PayPer;
}

/** One teaching opening as Find shows it, from a WonderWorks school or an outside source. */
export interface TeachingListing {
  /** `ws_<postingId>` for a WonderWorks posting; the WorksLake opportunity id otherwise. */
  id: string;
  origin: "wonderstar" | "outside";
  /** A WonderWorks posting's own id: what Apply sends to. */
  postingId?: string;
  title: string;
  /** The school, college, coaching centre or parent hiring. */
  company: string;
  companyVerified?: boolean;
  location: string;
  workMode?: WorkMode;
  terms: TeachingTerms;
  /** Where the terms came from: the school's own form, or read from the posting's text. */
  termsFrom: "company" | "posting";
  description: string;
  applyUrl?: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

/* ------------------------------------------------------------------ reading an outside posting */

const SUBJECTS: [RegExp, string][] = [
  [/\b(maths?|mathematics)\b/i, "Mathematics"],
  [/\bphysics\b/i, "Physics"],
  [/\bchemistry\b/i, "Chemistry"],
  [/\bbiology\b/i, "Biology"],
  [/\bcomputer science\b|\bcomputers?\b|\bcoding\b|\binformatics\b/i, "Computer Science"],
  [/\baccountancy\b|\baccounts?\b/i, "Accountancy"],
  [/\bcommerce\b|\bbusiness studies\b/i, "Commerce"],
  [/\beconomics\b/i, "Economics"],
  [/\bsocial (science|studies)\b|\bSST\b/i, "Social Science"],
  [/\bhistory\b/i, "History"],
  [/\bgeography\b/i, "Geography"],
  [/\bpolitical science\b|\bcivics\b/i, "Political Science"],
  [/\bscience\b/i, "Science"],
  [/\benglish\b|\bESL\b|\bELA\b/i, "English"],
  [/\bhindi\b/i, "Hindi"],
  [/\bsanskrit\b/i, "Sanskrit"],
  [/\bfrench\b/i, "French"],
  [/\bgerman\b/i, "German"],
  [/\bspanish\b/i, "Spanish"],
  [/\bphysical education\b|\bP\.?E\.? teacher\b|\bsports\b/i, "Physical Education"],
  [/\bmusic\b/i, "Music"],
  [/\b(art|drawing|fine arts)\b/i, "Art"],
  [/\bspecial (education|needs)\b|\bSEN\b|\bvisually impaired\b/i, "Special Education"],
];

/** The subject a posting names — in its title first, else its opening — or nothing. */
export function subjectFromText(title: string, body = ""): string | undefined {
  for (const s of [title, body.slice(0, 600)]) for (const [re, name] of SUBJECTS) if (re.test(s)) return name;
  return undefined;
}

/** The grade levels a posting names: PRT/TGT/PGT, "primary", "high school", "class 9", "lecturer"… */
export function gradesFromText(s: string): Grade[] {
  const out = new Set<Grade>();
  if (/\b(pre-?primary|nursery|kindergarten|KG|montessori|pre-?school|early years)\b/i.test(s)) out.add("pre_primary");
  if (/\bPRT\b|\bprimary\b|\belementary\b|\bG[1-5](-G[1-5])?\b/i.test(s)) out.add("primary");
  if (/\bmiddle school\b|\bTGT\b/i.test(s)) out.add("middle");
  if (/\bTGT\b|\bsecondary\b|\bhigh school\b/i.test(s)) out.add("secondary");
  if (/\bPGT\b|\bsenior secondary\b|\b(class|grade)(es)?\s*(11|12|xi|xii)\b/i.test(s)) out.add("senior");
  if (/\b(lecturer|professor|faculty|university|college)\b/i.test(s) && !/\bcollege (counsel|admission)/i.test(s)) out.add("college");
  for (const m of s.matchAll(/\b(?:class|grade|std\.?)\s*(\d{1,2})\b/gi)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 5) out.add("primary");
    else if (n <= 8) out.add("middle");
    else if (n <= 10) out.add("secondary");
    else if (n <= 12) out.add("senior");
  }
  // "Secondary" alone in "senior secondary" isn't grades 9–10.
  if (out.has("senior") && /\bsenior secondary\b/i.test(s) && !/\b(?<!senior )secondary\b/i.test(s)) out.delete("secondary");
  return GRADES.filter((g) => out.has(g));
}

/** The boards a posting names. */
export function boardsFromText(s: string): Board[] {
  const out: Board[] = [];
  if (/\bCBSE\b/.test(s)) out.push("CBSE");
  if (/\bICSE\b|\bISC\b|\bCISCE\b/.test(s)) out.push("ICSE");
  if (/\bstate board\b|\bSSC board\b/i.test(s)) out.push("State board");
  if (/\bIB\b|\bIBDP\b|\bPYP\b|\bMYP\b|international baccalaureate/i.test(s)) out.push("IB");
  if (/\bIGCSE\b|\bcambridge\b|\bCAIE\b/i.test(s)) out.push("Cambridge");
  return out;
}

/** The qualifications a posting asks for. */
export function requiresFromText(s: string): string[] {
  const out: string[] = [];
  if (/\bB\.?\s?Ed\b/i.test(s)) out.push("B.Ed");
  if (/\bCTET\b/.test(s)) out.push("CTET");
  if (/\b(?<!C)TET\b|\bSTET\b/.test(s)) out.push("State TET");
  if (/\bM\.?\s?Ed\b/i.test(s)) out.push("M.Ed");
  if (/\bUGC[-\s]?NET\b|\bNET\/SET\b|\bSET\/NET\b|\bNET qualified\b/.test(s)) out.push("UGC NET");
  if (/\bPh\.?\s?D\b/i.test(s)) out.push("PhD");
  return out;
}

/** Whether a posting is a teaching post at all: it says so in its title. */
export const isTeachingTitle = (title: string) => /\b(teacher|teaching|tutor|tuition|lecturer|professor|faculty|educator|instructor|PRT|TGT|PGT|trainer|coach|mentor)\b/i.test(title) && !/\b(sales|business development|counsel+or|admissions?)\b/i.test(title);

/** "Tuition" for a tutor's post; else the hours the source reports. */
export function hoursOf(title: string, jobType: string | undefined): Hours | undefined {
  if (/\b(tutor|tuition|home tutor)\b/i.test(title)) return "tuition";
  if (jobType === "part_time") return "part_time";
  if (jobType === "full_time") return "full_time";
  return undefined;
}

/** An outside posting's terms: only what it states. WorksLake keeps pay a year; teachers compare it a month. */
export function termsFromPosting(p: { title: string; description: string; jobType?: string; payMin?: number; payMax?: number; currency?: string }): TeachingTerms {
  const text = `${p.title}\n${p.description.slice(0, 3000)}`;
  const { min, max } = monthlyFromYearly(p.payMin, p.payMax);
  const subject = subjectFromText(p.title, p.description);
  const grades = gradesFromText(text);
  const boards = boardsFromText(text);
  const requires = requiresFromText(text);
  const hours = hoursOf(p.title, p.jobType);
  return {
    currency: p.currency ?? "INR",
    ...(subject ? { subject } : {}),
    ...(grades.length ? { grades } : {}),
    ...(boards.length ? { boards } : {}),
    ...(requires.length ? { requires } : {}),
    ...(hours ? { hours } : {}),
    ...(min !== undefined ? { payMin: min, payPer: "month" as const } : {}),
    ...(max !== undefined ? { payMax: max, payPer: "month" as const } : {}),
  };
}

/* ------------------------------------------------------------------ display */

/** "₹30,000–₹45,000 a month", "₹500 an hour", or "Pay not stated". */
export function payLabel(t: Pick<TeachingTerms, "payMin" | "payMax" | "currency" | "payPer">): string {
  if (t.payMin === undefined && t.payMax === undefined) return "Pay not stated";
  const lo = money(t.payMin ?? t.payMax!, t.currency);
  const range = t.payMax && t.payMax !== t.payMin ? `${lo}–${money(t.payMax, t.currency)}` : lo;
  return `${range} ${t.payPer === "hour" ? "an hour" : "a month"}`;
}

export const gradesLabel = (g: Grade[] | undefined) => (g?.length ? g.map((x) => GRADE_LABEL[x].replace(/ \(.*\)$/, "")).join(", ") : "Grades not stated");

/* ------------------------------------------------------------------ the teacher */

/** The teacher's Teaching profile (You → Teaching). Their own words; nothing is read in from elsewhere without them. */
export interface TeacherProfile {
  subjects: string[];
  grades: Grade[];
  boards: Board[];
  qualifications: string[];
  languages: string[];
}

export const EMPTY_PROFILE: TeacherProfile = { subjects: [], grades: [], boards: [], qualifications: [], languages: [] };

const list = (v: unknown, max: number, len = 60) => (Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === "string" ? x.trim().slice(0, len) : "")).filter(Boolean))].slice(0, max) : []);

/** What the profile still needs before an application can go. */
export function missingProfile(p: TeacherProfile | undefined | null): string[] {
  const out: string[] = [];
  if (!p?.subjects.length) out.push("subjects");
  if (!p?.grades.length) out.push("grade levels");
  return out;
}

export function cleanProfile(raw: unknown): { value: TeacherProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const subjects = list(r.subjects, 8);
  const grades = list(r.grades, GRADES.length).filter((g): g is Grade => (GRADES as readonly string[]).includes(g));
  if (!subjects.length) return { problem: "Add the subjects you teach." };
  if (!grades.length) return { problem: "Choose the grade levels you teach." };
  return { value: { subjects, grades, boards: list(r.boards, BOARDS.length).filter((b): b is Board => (BOARDS as readonly string[]).includes(b)), qualifications: list(r.qualifications, 10), languages: list(r.languages, 8, 40) } };
}

/* ------------------------------------------------------------------ match signals */

export interface MatchSignal {
  tone: "good" | "bad";
  text: string;
}

export interface TeachingMatch {
  fit: "strong" | "some" | "unknown";
  signals: MatchSignal[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What fits, and why — from the opening's own terms and the teacher's own profile only:
 * subject, grade levels, board and the qualifications the post asks for. A term the posting doesn't state gives no
 * signal (not a bad one).
 */
export function matchTeaching(l: Pick<TeachingListing, "title" | "terms">, p: TeacherProfile | undefined | null): TeachingMatch {
  const signals: MatchSignal[] = [];
  if (!p) return { fit: "unknown", signals };
  const t = l.terms;
  if (t.subject && p.subjects.length) {
    const hit = p.subjects.find((s) => same(s, t.subject!) || new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(l.title));
    signals.push(hit ? { tone: "good", text: `${t.subject} — a subject you teach` } : { tone: "bad", text: `${t.subject} isn't one of your subjects` });
  }
  if (t.grades?.length && p.grades.length) {
    const shared = t.grades.filter((g) => p.grades.includes(g));
    signals.push(shared.length ? { tone: "good", text: `${gradesLabel(shared)} — levels you teach` } : { tone: "bad", text: `For ${gradesLabel(t.grades)}, not levels you teach` });
  }
  if (t.boards?.length && p.boards.length) {
    const shared = t.boards.filter((b) => p.boards.includes(b));
    if (shared.length) signals.push({ tone: "good", text: `${shared.join(", ")} — a board you know` });
  }
  if (t.requires?.length) {
    const held = new Set(p.qualifications.map((q) => q.toLowerCase()));
    const missing = t.requires.filter((q) => !held.has(q.toLowerCase()));
    if (!missing.length) signals.push({ tone: "good", text: `Asks for ${t.requires.join(", ")} — you hold ${t.requires.length > 1 ? "them" : "it"}` });
    else if (p.qualifications.length) signals.push({ tone: "bad", text: `Asks for ${missing.join(", ")}` });
  }
  const good = signals.filter((s) => s.tone === "good").length;
  const bad = signals.some((s) => s.tone === "bad");
  return { fit: !signals.length ? "unknown" : bad ? "some" : good >= 2 ? "strong" : "some", signals };
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  grade?: Grade;
  board?: Board;
  hours?: Hours;
  remoteOnly?: boolean;
}

/** The openings Refine keeps, and how many it left out (so an empty result can say why). A term not stated doesn't pass a filter on it. */
export function applyFacets<T extends Pick<TeachingListing, "terms" | "workMode">>(items: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = items.filter((l) => {
    const t = l.terms;
    if (f.grade && !t.grades?.includes(f.grade)) return false;
    if (f.board && !t.boards?.includes(f.board)) return false;
    if (f.hours && t.hours !== f.hours) return false;
    if (f.remoteOnly && l.workMode !== "remote") return false;
    return true;
  });
  return { kept, hidden: items.length - kept.length };
}

/** A teacher's words, asked of a general job source as a teaching search ("physics" → "physics teacher"). */
export const asTeachingQuery = (q: string) => (/\b(teacher|teaching|tutor|lecturer|professor|faculty|educator|PRT|TGT|PGT)\b/i.test(q) ? q.trim() : `${q} teacher`.trim());

/* ------------------------------------------------------------------ a school's own posting */

/** A school's posting in the Teaching module (wonderjobs.listings, module = 'teaching'). */
export interface TeachingPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  terms: TeachingTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): TeachingTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const grades = Array.isArray(r.grades) ? r.grades.flatMap((g) => oneOf(g, GRADES) ?? []) : [];
  const boards = Array.isArray(r.boards) ? r.boards.flatMap((b) => oneOf(b, BOARDS) ?? []) : [];
  const requires = Array.isArray(r.requires) ? r.requires.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 10) : [];
  const hours = oneOf(r.hours, ["full_time", "part_time", "tuition"] as const);
  const payPer = oneOf(r.payPer, ["month", "hour"] as const);
  return {
    currency: typeof r.currency === "string" ? r.currency : "INR",
    ...(typeof r.subject === "string" && r.subject.trim() ? { subject: r.subject.trim().slice(0, 60) } : {}),
    ...(grades.length ? { grades } : {}),
    ...(boards.length ? { boards } : {}),
    ...(requires.length ? { requires } : {}),
    ...(hours ? { hours } : {}),
    ...(int(r.payMin, 0, 10_000_000) !== undefined ? { payMin: r.payMin as number } : {}),
    ...(int(r.payMax, 0, 10_000_000) !== undefined ? { payMax: r.payMax as number } : {}),
    ...(payPer ? { payPer } : {}),
  };
}

/* ------------------------------------------------------------------ the teacher's own record of an outside opening */

/** Where an outside opening stands, by the teacher's own word: Preparing, Applied or Withdrawn. */
export type OutsideStatus = "preparing" | "applied" | "withdrawn";

export const MARK_LABEL: Record<string, string> = { resume: "Résumé made", apply_opened: "Apply opened" };

/** A response's status; null when there's none. */
export function outsideStatus(ref: { stage: string; status?: string } | undefined): OutsideStatus | null {
  if (!ref) return null;
  const s = ref.status ?? ref.stage;
  return s === "preparing" || s === "applied" || s === "withdrawn" ? s : null;
}

/** The Pipeline stage each outside status sits in (manifest: Preparing · Applied · Demo class · Appointed / Closed). */
export const OUTSIDE_STAGE: Record<OutsideStatus, string> = { preparing: "preparing", applied: "applied", withdrawn: "appointed_closed" };
export const OUTSIDE_LABEL: Record<OutsideStatus, string> = { preparing: "Preparing", applied: "Applied on their site", withdrawn: "Withdrawn" };
