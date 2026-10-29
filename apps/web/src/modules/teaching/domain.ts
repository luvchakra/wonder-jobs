/**
 * WonderStar Teaching (WJ-420, docs/WONDERSTAR_PLATFORM.md §4): what a teaching role is, what a teacher tells us, what
 * "fits" means, how an application moves (applied → demo class → appointed / closed) and what a demo-class booking
 * is. Pure, so the server, the Teaching screens and the tests share it.
 *
 * Real data only: a term a posting doesn't state stays unstated, never guessed; a match signal is computed only from
 * the posting and the teacher's own profile, and always says why.
 */
import type { CareerDNA } from "@/domain/career/types";
import type { WorkMode } from "@/domain/jobs/types";

export const TEACHING = "teaching" as const;

export const BOARDS = ["CBSE", "ICSE", "State board", "IB", "Cambridge (IGCSE)", "Other"] as const;
export const GRADE_BANDS = ["Pre-primary", "Primary (1–5)", "Middle (6–8)", "Secondary (9–10)", "Senior secondary (11–12)", "College", "Competitive exams"] as const;
export const SCHOOL_TYPES = ["School", "College", "Coaching centre", "Online"] as const;
export const QUALIFICATIONS = ["B.Ed", "M.Ed", "D.El.Ed", "CTET", "State TET", "UGC NET", "PhD"] as const;
export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

export type Schedule = "part_time" | "full_time";
export const SCHEDULE_LABEL: Record<Schedule, string> = { part_time: "Part time", full_time: "Full time" };
export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Online", hybrid: "Hybrid", onsite: "On-site" };

/** A teaching role's own terms. Pay is a month's, as teachers compare it. */
export interface TeachingTerms {
  subject?: string;
  grades: string[];
  board?: string;
  schoolType?: string;
  payMin?: number;
  payMax?: number;
  currency: string;
  schedule?: Schedule;
  /** Qualifications the school asks for (B.Ed, CTET…). */
  requires: string[];
}

/** A school's posting in the Teaching module (wonderjobs.listings, module = 'teaching'). */
export interface TeachingPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  skills: string[];
  terms: TeachingTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

/** One teaching role as Find shows it, from a WonderStar school or an outside source. */
export interface TeachingListing {
  /** `ws_<postingId>` for a WonderStar posting; the JobsLake opportunity id otherwise. */
  id: string;
  origin: "wonderstar" | "outside";
  postingId?: string;
  title: string;
  company: string;
  companyVerified?: boolean;
  location: string;
  workMode?: WorkMode;
  terms: TeachingTerms;
  termsFrom: "school" | "posting";
  description: string;
  applyUrl?: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = (v: unknown, allowed: readonly string[], max = 8) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))].slice(0, max) : []);

/** "Teacher", "Tutor", "Faculty", "Lecturer"… — a title that says it's teaching. Nothing else counts. */
export const TEACHING_TITLE = /\b(teacher|teachers|teaching|tutor|tutors|tuition|faculty|lecturer|professor|educator|instructor|trainer|pgt|tgt|prt|mentor[- ]teacher|coach(?:ing)? faculty)\b/i;
export const isTeachingTitle = (title: string) => TEACHING_TITLE.test(title);

export interface PostingInput {
  title?: unknown;
  description?: unknown;
  location?: unknown;
  workMode?: unknown;
  skills?: unknown;
  subject?: unknown;
  grades?: unknown;
  board?: unknown;
  schoolType?: unknown;
  payMin?: unknown;
  payMax?: unknown;
  currency?: unknown;
  schedule?: unknown;
  requires?: unknown;
}

export type CleanPosting = Pick<TeachingPosting, "title" | "description" | "location" | "workMode" | "skills" | "terms">;

/** A school's teaching-role form, checked: subject, grades, board, school type, pay a month, part or full time, and where. */
export function cleanPosting(i: PostingInput): { value: CleanPosting } | { problem: string } {
  const title = text(i.title, 160);
  if (title.length < 3) return { problem: "Give the role a title." };
  const description = text(i.description, 8000);
  if (description.length < 30) return { problem: "Describe the role in a few sentences (classes, hours, what you expect)." };
  const subject = text(i.subject, 80);
  if (!subject) return { problem: "Say which subject." };
  const grades = pick(i.grades, GRADE_BANDS);
  if (!grades.length) return { problem: "Choose the grades it teaches." };
  const board = typeof i.board === "string" && (BOARDS as readonly string[]).includes(i.board) ? i.board : null;
  if (!board) return { problem: "Choose the board." };
  const schoolType = typeof i.schoolType === "string" && (SCHOOL_TYPES as readonly string[]).includes(i.schoolType) ? i.schoolType : null;
  if (!schoolType) return { problem: "Say what kind of institution it is." };
  const workMode = i.workMode === "remote" || i.workMode === "hybrid" || i.workMode === "onsite" ? i.workMode : null;
  if (!workMode) return { problem: "Say whether it's online, hybrid or on-site." };
  const location = text(i.location, 160);
  if (workMode !== "remote" && !location) return { problem: "Say where the teacher will work." };
  const schedule = i.schedule === "part_time" || i.schedule === "full_time" ? i.schedule : null;
  if (!schedule) return { problem: "Say whether it's part time or full time." };
  const currency = typeof i.currency === "string" && (CURRENCIES as readonly string[]).includes(i.currency) ? i.currency : null;
  if (!currency) return { problem: "Choose the pay's currency." };
  const payMin = int(i.payMin, 1, 10_000_000);
  if (payMin === undefined) return { problem: "Give the pay a month." };
  const payMax = i.payMax == null || i.payMax === "" ? undefined : int(i.payMax, 1, 10_000_000);
  if (i.payMax != null && i.payMax !== "" && payMax === undefined) return { problem: "The pay's upper end should be a whole number." };
  if (payMax !== undefined && payMax < payMin) return { problem: "The pay's upper end is below its lower end." };
  const skills = Array.isArray(i.skills) ? [...new Set(i.skills.map((s) => text(s, 60)).filter(Boolean))].slice(0, 20) : [];
  const terms: TeachingTerms = { subject, grades, board, schoolType, payMin, ...(payMax !== undefined && payMax !== payMin ? { payMax } : {}), currency, schedule, requires: pick(i.requires, QUALIFICATIONS) };
  return { value: { title, description, location: workMode === "remote" ? location || "Online" : location, workMode, skills, terms } };
}

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): TeachingTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    currency: typeof r.currency === "string" ? r.currency : "INR",
    grades: pick(r.grades, GRADE_BANDS),
    requires: pick(r.requires, QUALIFICATIONS),
    ...(typeof r.subject === "string" && r.subject ? { subject: r.subject } : {}),
    ...(typeof r.board === "string" && (BOARDS as readonly string[]).includes(r.board) ? { board: r.board } : {}),
    ...(typeof r.schoolType === "string" && (SCHOOL_TYPES as readonly string[]).includes(r.schoolType) ? { schoolType: r.schoolType } : {}),
    ...(int(r.payMin, 1, 10_000_000) !== undefined ? { payMin: r.payMin as number } : {}),
    ...(int(r.payMax, 1, 10_000_000) !== undefined ? { payMax: r.payMax as number } : {}),
    ...(r.schedule === "part_time" || r.schedule === "full_time" ? { schedule: r.schedule } : {}),
  };
}

/* ------------------------------------------------------------------ outside postings */

/** A board a posting names in its own words ("CBSE school", "IB PYP"), or nothing. */
export function boardFromText(s: string): string | undefined {
  if (/\bCBSE\b/i.test(s)) return "CBSE";
  if (/\b(ICSE|ISC)\b/i.test(s)) return "ICSE";
  if (/\bIB\b|\bInternational Baccalaureate\b|\b(PYP|MYP)\b/.test(s)) return "IB";
  if (/\b(IGCSE|Cambridge)\b/i.test(s)) return "Cambridge (IGCSE)";
  if (/\bstate board\b/i.test(s)) return "State board";
  return undefined;
}

/** Grade bands a posting names ("PRT", "TGT", "PGT", "class 11", "primary"…). */
export function gradesFromText(s: string): string[] {
  const out = new Set<string>();
  if (/\b(PRT|primary|class(es)? [1-5]\b|grades? [1-5]\b)/i.test(s)) out.add("Primary (1–5)");
  if (/\b(middle school|class(es)? [6-8]\b|grades? [6-8]\b)/i.test(s)) out.add("Middle (6–8)");
  if (/\b(TGT|secondary|class(es)? (9|10)\b|grades? (9|10)\b)/i.test(s)) out.add("Secondary (9–10)");
  if (/\b(PGT|senior secondary|class(es)? (11|12)\b|grades? (11|12)\b)/i.test(s)) out.add("Senior secondary (11–12)");
  if (/\b(pre[- ]?primary|kindergarten|nursery|montessori)\b/i.test(s)) out.add("Pre-primary");
  if (/\b(lecturer|professor|assistant professor|college faculty)\b/i.test(s)) out.add("College");
  if (/\b(JEE|NEET|UPSC|competitive exams?)\b/i.test(s)) out.add("Competitive exams");
  return GRADE_BANDS.filter((g) => out.has(g));
}

/** A yearly salary range (how JobsLake keeps pay) as a month's; nothing when the posting states none. */
export function monthlyFromYearly(min: number | undefined, max: number | undefined, currency: string): Pick<TeachingTerms, "payMin" | "payMax" | "currency"> {
  const m = (v: number | undefined) => (typeof v === "number" && v > 0 ? Math.round(v / 12) : undefined);
  const lo = m(min) ?? m(max);
  const hi = m(max);
  return { currency, ...(lo !== undefined ? { payMin: lo } : {}), ...(hi !== undefined && hi !== lo ? { payMax: hi } : {}) };
}

/* ------------------------------------------------------------------ display */

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const money = (v: number, currency: string) => `${SYMBOL[currency] ?? `${currency} `}${v.toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`;

/** "₹30,000–₹40,000 a month" or "Pay not stated". */
export function payLabel(t: Pick<TeachingTerms, "payMin" | "payMax" | "currency">): string {
  if (t.payMin === undefined && t.payMax === undefined) return "Pay not stated";
  const lo = money(t.payMin ?? t.payMax!, t.currency);
  return `${t.payMax && t.payMax !== t.payMin ? `${lo}–${money(t.payMax, t.currency)}` : lo} a month`;
}

/** "Maths · Secondary (9–10), Senior secondary (11–12) · CBSE", or what the posting doesn't say. */
export function classLine(t: Pick<TeachingTerms, "subject" | "grades" | "board">): string {
  return [t.subject ?? "Subject not stated", t.grades.length ? t.grades.join(", ") : "Grades not stated", t.board ?? "Board not stated"].join(" · ");
}

export const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const shortDateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/* ------------------------------------------------------------------ the teacher */

/** The teacher's Teaching profile (Teaching → You). Prefilled from the Career Profile, never written back to it. */
export interface TeacherProfile {
  subjects: string[];
  grades: string[];
  boards: string[];
  qualifications: string[];
  languages: string[];
  /**
   * Whether the teacher has a police verification or background check, as they say (with its date). Schools working
   * with children see it on the application; WonderStar shows it as the teacher's own statement, never as verified.
   */
  backgroundCheck?: { has: boolean; on?: string };
  from?: "career_profile" | "teacher";
}

export const EMPTY_PROFILE: TeacherProfile = { subjects: [], grades: [], boards: [], qualifications: [], languages: [] };

export function missingProfile(p: TeacherProfile | undefined): string[] {
  const out: string[] = [];
  if (!p?.subjects.length) out.push("subjects");
  if (!p?.grades.length) out.push("grades");
  if (!p?.boards.length) out.push("boards");
  if (!p?.backgroundCheck) out.push("background check");
  return out;
}

const list = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, 60)).filter(Boolean))].slice(0, max) : []);

export function cleanProfile(raw: unknown): { value: TeacherProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const subjects = list(r.subjects, 10);
  if (!subjects.length) return { problem: "Add the subjects you teach." };
  const grades = pick(r.grades, GRADE_BANDS);
  if (!grades.length) return { problem: "Choose the grades you teach." };
  const boards = pick(r.boards, BOARDS);
  if (!boards.length) return { problem: "Choose the boards you've taught or can teach." };
  const bc = r.backgroundCheck && typeof r.backgroundCheck === "object" ? (r.backgroundCheck as Record<string, unknown>) : null;
  if (!bc || typeof bc.has !== "boolean") return { problem: "Say whether you have a police verification or background check." };
  if (bc.has && bc.on !== undefined && !isDate(bc.on)) return { problem: "Give the background check's date as a date." };
  return { value: { subjects, grades, boards, qualifications: pick(r.qualifications, QUALIFICATIONS), languages: list(r.languages, 8), backgroundCheck: bc.has ? { has: true, ...(isDate(bc.on) ? { on: bc.on } : {}) } : { has: false }, from: "teacher" } };
}

/** Qualifications read from the Career Profile's certifications and degrees (B.Ed, CTET…); everything else is asked. */
export function profileFromCareer(dna: Pick<CareerDNA, "history"> | undefined): TeacherProfile {
  const names = [...(dna?.history?.certifications ?? []).map((c) => c.name), ...(dna?.history?.education ?? []).map((e) => `${e.degree ?? ""} ${e.field ?? ""}`)].join(" | ");
  const qualifications = QUALIFICATIONS.filter((q) => new RegExp(`\\b${q.replace(".", "\\.?").replace(" ", "\\s*")}\\b`, "i").test(names));
  return qualifications.length ? { ...EMPTY_PROFILE, qualifications, from: "career_profile" } : { ...EMPTY_PROFILE };
}

/* ------------------------------------------------------------------ match signals */

export interface MatchSignal {
  tone: "good" | "bad";
  text: string;
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

/** What fits, and why — subject, grades, board and required qualifications against the teacher's own profile. */
export function matchTeaching(l: Pick<TeachingListing, "title" | "terms">, p: TeacherProfile | undefined): MatchSignal[] {
  if (!p) return [];
  const out: MatchSignal[] = [];
  const t = l.terms;
  const subj = lower(p.subjects).find((s) => (t.subject ?? l.title).toLowerCase().includes(s));
  if (subj) out.push({ tone: "good", text: `Teaches ${p.subjects.find((s) => s.toLowerCase() === subj)} — one of your subjects` });
  const grades = t.grades.filter((g) => p.grades.includes(g));
  if (grades.length) out.push({ tone: "good", text: `${grades.join(", ")} — grades you teach` });
  else if (t.grades.length) out.push({ tone: "bad", text: `For ${t.grades.join(", ")} — not grades on your profile` });
  if (t.board) out.push(p.boards.includes(t.board) ? { tone: "good", text: `${t.board} — a board you know` } : { tone: "bad", text: `${t.board} — not a board on your profile` });
  const missing = t.requires.filter((q) => !p.qualifications.includes(q));
  if (t.requires.length) out.push(missing.length ? { tone: "bad", text: `Asks for ${missing.join(", ")}, not on your profile` } : { tone: "good", text: `You have the ${t.requires.join(", ")} it asks for` });
  return out;
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  board?: string;
  grade?: string;
  minPay?: number;
  onlineOnly?: boolean;
}

export const facetCount = (f: Facets) => [f.board, f.grade, f.minPay, f.onlineOnly || undefined].filter((v) => v !== undefined && v !== "").length;

/** The listings Refine keeps, and how many it hid. A posting that doesn't state a term is left out of that facet. */
export function applyFacets<T extends Pick<TeachingListing, "terms" | "workMode">>(list: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = list.filter((l) => {
    const t = l.terms;
    if (f.board && t.board !== f.board) return false;
    if (f.grade && !t.grades.includes(f.grade)) return false;
    if (f.minPay && (t.payMax ?? t.payMin ?? -1) < f.minPay) return false;
    if (f.onlineOnly && l.workMode !== "remote") return false;
    return true;
  });
  return { kept, hidden: list.length - kept.length };
}

/* ------------------------------------------------------------------ applications and demo classes */

export type TeachingStatus = "applied" | "demo_class" | "appointed" | "closed" | "withdrawn";
export const STATUS_LABEL: Record<TeachingStatus, string> = { applied: "Applied", demo_class: "Demo class", appointed: "Appointed", closed: "Closed", withdrawn: "Withdrawn" };

/** Where a school may move an application. A demo class is booked (`proposeDemo`), not set directly. */
export const SCHOOL_NEXT: Record<TeachingStatus, TeachingStatus[]> = {
  applied: ["appointed", "closed"],
  demo_class: ["appointed", "closed"],
  appointed: [],
  closed: [],
  withdrawn: [],
};

export const canWithdraw = (s: TeachingStatus) => s === "applied" || s === "demo_class";

export function stageOf(s: TeachingStatus): "applied" | "demo_class" | "appointed_closed" {
  return s === "applied" || s === "demo_class" ? s : "appointed_closed";
}

/** A demo class: the school proposes a time; the teacher confirms or declines; the school marks it held or cancels. */
export type BookingStatus = "proposed" | "confirmed" | "declined" | "cancelled" | "held";
export const BOOKING_LABEL: Record<BookingStatus, string> = { proposed: "Proposed", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled", held: "Held" };

export interface DemoBooking {
  id: string;
  responseId: string;
  startsAt: string;
  durationMin: number;
  mode: "online" | "in_person";
  /** A meeting link (online) or an address (in person). */
  where: string;
  note: string;
  status: BookingStatus;
  updatedAt: string;
}

export interface BookingInput {
  startsAt?: unknown;
  durationMin?: unknown;
  mode?: unknown;
  where?: unknown;
  note?: unknown;
}

/** A demo-class slot, checked: in the future, 15–180 minutes, online with an https link or in person with an address. */
export function cleanBooking(i: BookingInput, now = Date.now()): { value: Pick<DemoBooking, "startsAt" | "durationMin" | "mode" | "where" | "note"> } | { problem: string } {
  const at = typeof i.startsAt === "string" ? Date.parse(i.startsAt) : NaN;
  if (Number.isNaN(at)) return { problem: "Give the demo class a date and time." };
  if (at < now + 30 * 60_000) return { problem: "The demo class should be at least half an hour from now." };
  const durationMin = int(i.durationMin, 15, 180);
  if (!durationMin) return { problem: "Give a length between 15 minutes and 3 hours." };
  const mode = i.mode === "online" || i.mode === "in_person" ? i.mode : null;
  if (!mode) return { problem: "Say whether it's online or in person." };
  const where = text(i.where, 400);
  if (mode === "online" && !/^https:\/\/\S+$/.test(where)) return { problem: "Give the meeting link (starting https://)." };
  if (mode === "in_person" && where.length < 5) return { problem: "Give the address." };
  return { value: { startsAt: new Date(at).toISOString(), durationMin, mode, where, note: text(i.note, 1000) } };
}

/** One of the teacher's own applications, as their Pipeline shows it. */
export interface MyTeachingApplication {
  id: string;
  postingId: string;
  title: string;
  company: string;
  status: TeachingStatus;
  terms: TeachingTerms;
  appliedAt: string;
  updatedAt: string;
  bookings: DemoBooking[];
}

/** One application as the school sees it (Teaching → School). */
export interface TeachingApplicationView {
  id: string;
  postingId: string;
  postingTitle: string;
  name: string;
  email: string;
  status: TeachingStatus;
  profile: TeacherProfile & { skills?: string[] };
  coverNote: string;
  hasResume: boolean;
  appliedAt: string;
  updatedAt: string;
  bookings: DemoBooking[];
}
