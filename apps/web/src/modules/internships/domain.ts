/**
 * WonderStar Internships (WJ-417, docs/WONDERSTAR_PLATFORM.md §4): what an internship is, what a student tells us, what
 * "fits" means and how an application moves. Pure, so the server, the Internships screens and the tests share it.
 *
 * Real data only: a term a posting doesn't state stays unstated ("Stipend not stated"), never guessed; a match signal
 * is only ever computed from the posting and the student's own profile, and always says why.
 */
import type { CareerDNA } from "@/domain/career/types";
import type { WorkMode } from "@/domain/jobs/types";

export const INTERNSHIPS = "internships" as const;

export type Schedule = "part_time" | "full_time";
export const SCHEDULE_LABEL: Record<Schedule, string> = { part_time: "Part time", full_time: "Full time" };
export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
export const DURATIONS = [1, 2, 3, 4, 6, 9, 12] as const;
export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

/** An internship's own terms. The stipend is a month's pay, as students compare it. */
export interface InternshipTerms {
  stipendMin?: number;
  stipendMax?: number;
  currency: string;
  /** 1–24 months. */
  durationMonths?: number;
  /** YYYY-MM-DD. */
  startsOn?: string;
  /** YYYY-MM-DD: the last day to apply. */
  applyBy?: string;
  schedule?: Schedule;
}

/** A company's posting in the Internships module (wonderjobs.listings, module = 'internships'). */
export interface InternshipPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  skills: string[];
  terms: InternshipTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

/** One internship as Find shows it, from a WonderStar company or an outside source. */
export interface InternshipListing {
  /** `ws_<postingId>` for a WonderStar posting; the JobsLake opportunity id otherwise. */
  id: string;
  origin: "wonderstar" | "outside";
  /** A WonderStar posting's own id: what Apply sends to. */
  postingId?: string;
  title: string;
  company: string;
  /** A WonderStar company WonderStar hasn't verified yet says so. */
  companyVerified?: boolean;
  location: string;
  workMode?: WorkMode;
  terms: InternshipTerms;
  /** Where each term came from: the company's own form, or read from the posting's text. */
  termsFrom: "company" | "posting";
  skills: string[];
  description: string;
  /** Outside postings: the employer's own page. */
  applyUrl?: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface PostingInput {
  title?: unknown;
  description?: unknown;
  location?: unknown;
  workMode?: unknown;
  skills?: unknown;
  stipendMin?: unknown;
  stipendMax?: unknown;
  currency?: unknown;
  durationMonths?: unknown;
  startsOn?: unknown;
  applyBy?: unknown;
  schedule?: unknown;
}

export type CleanPosting = Pick<InternshipPosting, "title" | "description" | "location" | "workMode" | "skills" | "terms">;

/**
 * A company's internship form, checked. Every term the brief asks for is required — stipend a month, duration, start
 * date, apply-by date, part or full time, and remote/hybrid/on-site — so a student never meets a WonderStar internship
 * that leaves them out. A stipend of 0 is an unpaid internship and says so.
 */
export function cleanPosting(i: PostingInput, today = new Date().toISOString().slice(0, 10)): { value: CleanPosting } | { problem: string } {
  const title = text(i.title, 160);
  if (title.length < 3) return { problem: "Give the internship a title." };
  const description = text(i.description, 8000);
  if (description.length < 30) return { problem: "Describe the internship in a few sentences (what the intern will do and learn)." };
  const workMode = i.workMode === "remote" || i.workMode === "hybrid" || i.workMode === "onsite" ? i.workMode : null;
  if (!workMode) return { problem: "Say whether it's remote, hybrid or on-site." };
  const location = text(i.location, 160);
  if (workMode !== "remote" && !location) return { problem: "Say where the intern will work." };
  const schedule = i.schedule === "part_time" || i.schedule === "full_time" ? i.schedule : null;
  if (!schedule) return { problem: "Say whether it's part time or full time." };
  const currency = typeof i.currency === "string" && (CURRENCIES as readonly string[]).includes(i.currency) ? i.currency : null;
  if (!currency) return { problem: "Choose the stipend's currency." };
  const stipendMin = int(i.stipendMin, 0, 10_000_000);
  if (stipendMin === undefined) return { problem: "Give the stipend a month (0 for an unpaid internship)." };
  const stipendMax = i.stipendMax == null || i.stipendMax === "" ? undefined : int(i.stipendMax, 0, 10_000_000);
  if (i.stipendMax != null && i.stipendMax !== "" && stipendMax === undefined) return { problem: "The stipend's upper end should be a whole number." };
  if (stipendMax !== undefined && stipendMax < stipendMin) return { problem: "The stipend's upper end is below its lower end." };
  const durationMonths = int(i.durationMonths, 1, 24);
  if (!durationMonths) return { problem: "Give the duration in months (1 to 24)." };
  if (!isDate(i.startsOn)) return { problem: "Give the start date." };
  if (!isDate(i.applyBy)) return { problem: "Give the last day to apply." };
  if (i.applyBy > i.startsOn) return { problem: "The last day to apply should be on or before the start date." };
  if (i.applyBy < today) return { problem: "The last day to apply has passed." };
  const skills = Array.isArray(i.skills) ? [...new Set(i.skills.map((s) => text(s, 60)).filter(Boolean))].slice(0, 20) : [];
  const terms: InternshipTerms = { stipendMin, ...(stipendMax !== undefined && stipendMax !== stipendMin ? { stipendMax } : {}), currency, durationMonths, startsOn: i.startsOn, applyBy: i.applyBy, schedule };
  return { value: { title, description, location: workMode === "remote" ? location || "Remote" : location, workMode, skills, terms } };
}

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): InternshipTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const currency = typeof r.currency === "string" ? r.currency : "INR";
  return {
    currency,
    ...(int(r.stipendMin, 0, 10_000_000) !== undefined ? { stipendMin: r.stipendMin as number } : {}),
    ...(int(r.stipendMax, 0, 10_000_000) !== undefined ? { stipendMax: r.stipendMax as number } : {}),
    ...(int(r.durationMonths, 1, 24) ? { durationMonths: r.durationMonths as number } : {}),
    ...(isDate(r.startsOn) ? { startsOn: r.startsOn } : {}),
    ...(isDate(r.applyBy) ? { applyBy: r.applyBy } : {}),
    ...(r.schedule === "part_time" || r.schedule === "full_time" ? { schedule: r.schedule } : {}),
  };
}

/* ------------------------------------------------------------------ outside postings */

/**
 * "6 months", "3-month", "(12 weeks)" in a posting's own title or opening — the duration it states, or nothing.
 * Weeks round to whole months (12 weeks → 3).
 */
export function durationFromText(s: string): number | undefined {
  const m = /\b(\d{1,2})[\s-]*(months?|mos?|weeks?|wks?)\b/i.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  const months = /^w/i.test(m[2]) ? Math.round(n / 4.33) : n;
  return months >= 1 && months <= 24 ? months : undefined;
}

/** A yearly salary range (how JobsLake keeps pay) as a month's stipend; nothing when the posting states none. */
export function monthlyFromYearly(min: number | undefined, max: number | undefined, currency: string): Pick<InternshipTerms, "stipendMin" | "stipendMax" | "currency"> {
  const m = (v: number | undefined) => (typeof v === "number" && v > 0 ? Math.round(v / 12) : undefined);
  const lo = m(min) ?? m(max);
  const hi = m(max);
  return { currency, ...(lo !== undefined ? { stipendMin: lo } : {}), ...(hi !== undefined && hi !== lo ? { stipendMax: hi } : {}) };
}

/* ------------------------------------------------------------------ display */

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const money = (v: number, currency: string) => `${SYMBOL[currency] ?? `${currency} `}${v.toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`;

/** "₹15,000–₹20,000 a month", "Unpaid", or "Stipend not stated". */
export function stipendLabel(t: Pick<InternshipTerms, "stipendMin" | "stipendMax" | "currency">): string {
  if (t.stipendMin === undefined && t.stipendMax === undefined) return "Stipend not stated";
  if (t.stipendMin === 0 && !t.stipendMax) return "Unpaid";
  const lo = money(t.stipendMin ?? t.stipendMax!, t.currency);
  return `${t.stipendMax && t.stipendMax !== t.stipendMin ? `${lo}–${money(t.stipendMax, t.currency)}` : lo} a month`;
}

export const durationLabel = (t: Pick<InternshipTerms, "durationMonths">) => (t.durationMonths ? `${t.durationMonths} ${t.durationMonths === 1 ? "month" : "months"}` : "Duration not stated");

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const startLabel = (t: Pick<InternshipTerms, "startsOn">) => (t.startsOn ? `Starts ${shortDate(t.startsOn)}` : "Start date not stated");

/* ------------------------------------------------------------------ the student */

/** The student's Internships profile (You → Internships). Prefilled from the Career Profile's education, never written back to it. */
export interface StudentProfile {
  college: string;
  course: string;
  graduationYear?: number;
  /** YYYY-MM-DD: the window they can intern in. */
  availableFrom?: string;
  availableTo?: string;
  /** Who filled each part: the student, or read from their Career Profile and not yet confirmed. */
  from?: "career_profile" | "student";
}

export const EMPTY_PROFILE: StudentProfile = { college: "", course: "" };

/** What the profile still needs before an application can go: the brief's four answers. */
export function missingProfile(p: StudentProfile | undefined): string[] {
  const out: string[] = [];
  if (!p?.college.trim()) out.push("college");
  if (!p?.course.trim()) out.push("course");
  if (!p?.graduationYear) out.push("graduation year");
  if (!p?.availableFrom || !p?.availableTo) out.push("availability");
  return out;
}

export function cleanProfile(raw: unknown): { value: StudentProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const college = text(r.college, 160);
  const course = text(r.course, 160);
  const graduationYear = int(r.graduationYear, 1950, 2100);
  if (!college || !course || !graduationYear) return { problem: "Add your college, course and graduation year." };
  if (!isDate(r.availableFrom) || !isDate(r.availableTo)) return { problem: "Add when you're available to intern." };
  if (r.availableTo < r.availableFrom) return { problem: "Your availability ends before it starts." };
  return { value: { college, course, graduationYear, availableFrom: r.availableFrom, availableTo: r.availableTo, from: "student" } };
}

/**
 * The profile's college, course and graduation year read from the Career Profile's education (most recent first),
 * marked as read from there for the student to confirm. Availability is never inferred: it's asked.
 */
export function profileFromCareer(dna: Pick<CareerDNA, "history"> | undefined): StudentProfile {
  const ed = [...(dna?.history?.education ?? [])].sort((a, b) => (b.endDate ?? b.startDate ?? "").localeCompare(a.endDate ?? a.startDate ?? ""))[0];
  if (!ed) return { ...EMPTY_PROFILE };
  const year = Number(/\d{4}/.exec(ed.endDate ?? "")?.[0]);
  return { college: ed.institution ?? "", course: [ed.degree, ed.field].filter(Boolean).join(" ").trim(), ...(year >= 1950 && year <= 2100 ? { graduationYear: year } : {}), from: "career_profile" };
}

/* ------------------------------------------------------------------ match signals */

export interface MatchSignal {
  /** "good": counts for it; "bad": counts against it. */
  tone: "good" | "bad";
  text: string;
}

export interface InternshipMatch {
  fit: "strong" | "some" | "unknown";
  signals: MatchSignal[];
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2);
const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * What fits, and why — computed only from the posting and the student's own profile and skills.
 * - Field and skills: the student's skills and course words the posting names.
 * - Dates: the start date and duration against the availability window.
 * A term the posting doesn't state gives no signal (not a bad one).
 */
export function matchInternship(l: Pick<InternshipListing, "title" | "description" | "skills" | "terms">, p: StudentProfile | undefined, skills: string[]): InternshipMatch {
  const signals: MatchSignal[] = [];
  const hay = new Set([...words(l.title), ...words(l.skills.join(" ")), ...words(l.description.slice(0, 4000))]);
  const shared = [...new Set(skills.map((s) => s.trim()).filter((s) => s && words(s).length && words(s).every((w) => hay.has(w))))].slice(0, 3);
  if (shared.length) signals.push({ tone: "good", text: `Asks for ${shared.join(", ")} — on your profile` });
  const course = p?.course ? words(p.course).filter((w) => !["bachelor", "master", "degree", "b.tech", "m.tech", "b.sc", "m.sc", "b.a", "m.a", "and", "the", "of", "in"].includes(w)) : [];
  const fieldHit = course.find((w) => words(l.title).includes(w) || words(l.skills.join(" ")).includes(w));
  if (fieldHit) signals.push({ tone: "good", text: `In your field (${p!.course})` });
  const t = l.terms;
  if (t.startsOn && p?.availableFrom && p.availableTo) {
    const end = t.durationMonths ? addMonths(t.startsOn, t.durationMonths) : undefined;
    if (t.startsOn < p.availableFrom) signals.push({ tone: "bad", text: `Starts ${shortDate(t.startsOn)}, before you're available (${shortDate(p.availableFrom)})` });
    else if (t.startsOn > p.availableTo) signals.push({ tone: "bad", text: `Starts ${shortDate(t.startsOn)}, after your availability ends` });
    else if (end && end > p.availableTo) signals.push({ tone: "bad", text: `Runs to ${shortDate(end)}, past your availability (${shortDate(p.availableTo)})` });
    else signals.push({ tone: "good", text: `Starts ${shortDate(t.startsOn)}${end ? ` and ends ${shortDate(end)}` : ""}, inside your availability` });
  }
  const good = signals.filter((s) => s.tone === "good").length;
  const bad = signals.some((s) => s.tone === "bad");
  const fit = !signals.length ? "unknown" : bad ? "some" : good >= 2 ? "strong" : "some";
  return { fit, signals };
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  /** At least this stipend a month (in the posting's currency); a posting that states none is left out. */
  minStipend?: number;
  /** At most this many months. */
  maxMonths?: number;
  /** YYYY-MM: starts in this month. */
  startMonth?: string;
  remoteOnly?: boolean;
}

export const facetCount = (f: Facets) => [f.minStipend, f.maxMonths, f.startMonth, f.remoteOnly || undefined].filter((v) => v !== undefined && v !== "").length;

/** The listings Refine keeps, and how many each facet left out (so an empty result can say why). */
export function applyFacets<T extends Pick<InternshipListing, "terms" | "workMode">>(list: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = list.filter((l) => {
    const t = l.terms;
    if (f.minStipend !== undefined && f.minStipend > 0 && (t.stipendMax ?? t.stipendMin ?? -1) < f.minStipend) return false;
    if (f.maxMonths !== undefined && (!t.durationMonths || t.durationMonths > f.maxMonths)) return false;
    if (f.startMonth && (!t.startsOn || t.startsOn.slice(0, 7) !== f.startMonth)) return false;
    if (f.remoteOnly && l.workMode !== "remote") return false;
    return true;
  });
  return { kept, hidden: list.length - kept.length };
}

/** A listing whose apply-by date has passed is closed to students; Find leaves it out. */
export const stillOpen = (t: Pick<InternshipTerms, "applyBy">, today = new Date().toISOString().slice(0, 10)) => !t.applyBy || t.applyBy >= today;

/* ------------------------------------------------------------------ applications */

export type InternshipStatus = "applied" | "shortlisted" | "offer" | "accepted" | "closed" | "withdrawn";
export const STATUS_LABEL: Record<InternshipStatus, string> = { applied: "Applied", shortlisted: "Shortlisted", offer: "Offer", accepted: "Accepted", closed: "Closed", withdrawn: "Withdrawn" };

/** Where a company may move an application. Accepting an offer is the student's alone. */
export const COMPANY_NEXT: Record<InternshipStatus, InternshipStatus[]> = {
  applied: ["shortlisted", "offer", "closed"],
  shortlisted: ["offer", "closed"],
  offer: ["closed"],
  accepted: [],
  closed: [],
  withdrawn: [],
};

/** The student withdraws while it's open, or declines an offer — both close it with the company. */
export const canWithdraw = (s: InternshipStatus) => s === "applied" || s === "shortlisted" || s === "offer";

/** The Pipeline stage (modules/registry.ts) a status sits in. */
export function stageOf(s: InternshipStatus): "applied" | "shortlisted" | "offer" | "accepted_closed" {
  return s === "applied" || s === "shortlisted" || s === "offer" ? s : "accepted_closed";
}

/** One of the student's own applications, as their Pipeline shows it. */
export interface MyInternshipApplication {
  id: string;
  postingId: string;
  title: string;
  company: string;
  status: InternshipStatus;
  terms: InternshipTerms;
  appliedAt: string;
  updatedAt: string;
}

/** Deadlines: apply-by dates of saved internships not yet applied to, and start dates of accepted ones, soonest first, from today. */
export function deadlines(saved: Pick<InternshipListing, "id" | "title" | "company" | "terms">[], mine: MyInternshipApplication[], today = new Date().toISOString().slice(0, 10)) {
  const applied = new Set(mine.map((a) => `ws_${a.postingId}`));
  const out: { id: string; date: string; label: string; title: string; company: string }[] = [];
  for (const s of saved) if (s.terms.applyBy && s.terms.applyBy >= today && !applied.has(s.id)) out.push({ id: `apply:${s.id}`, date: s.terms.applyBy, label: "Apply by", title: s.title, company: s.company });
  for (const a of mine) if (a.status === "accepted" && a.terms.startsOn && a.terms.startsOn >= today) out.push({ id: `start:${a.id}`, date: a.terms.startsOn, label: "Starts", title: a.title, company: a.company });
  for (const a of mine) if (a.status === "offer") out.push({ id: `offer:${a.id}`, date: a.updatedAt.slice(0, 10), label: "Offer to answer", title: a.title, company: a.company });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** One application as the company sees it (Internships → Company). */
export interface InternshipApplicationView {
  id: string;
  postingId: string;
  postingTitle: string;
  name: string;
  email: string;
  status: InternshipStatus;
  profile: StudentProfile & { skills?: string[] };
  coverNote: string;
  hasResume: boolean;
  appliedAt: string;
  updatedAt: string;
}
