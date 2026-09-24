/**
 * Field classification (spec §19–§24). Every field an application form shows is read as:
 * what it asks (category), who may answer it (classification), what in the candidate's own data
 * could answer it (target), and how sure Wonder is (confidence).
 *
 * Order matters: human-only questions (credentials, EEO, legal, work authorization, sponsorship,
 * government ids, payment) are recognised FIRST, so a label like "Name of your visa sponsor" can
 * never be mistaken for a name field. A human-only field never gets a target — there is nothing
 * Wonder is allowed to put in it.
 */
import type { ApplicationField, Classification, Confidence, MemoryKey, ProfileKey, QuestionCategory } from "./types";

export type FieldTarget =
  | { kind: "profile"; key: ProfileKey }
  | { kind: "memory"; key: MemoryKey }
  | { kind: "file"; file: "resume" | "cover_letter" }
  | { kind: "cover_text" }
  | { kind: "pack_answer" }
  | { kind: "draft" }
  | { kind: "metric" }
  | { kind: "none" };

export interface FieldClass {
  category: QuestionCategory;
  classification: Classification;
  target: FieldTarget;
  confidence: Confidence;
  /** Plain-language reason shown when Wonder leaves a field for the candidate. */
  reason?: string;
}

/** "first_name", "firstName", "applicant.first-name" → "first name applicant". */
function words(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]:]+/g, " ")
    .toLowerCase();
}

/** Everything a human (or screen reader) would read as the field's question. */
export function fieldText(f: ApplicationField): { visible: string; attrs: string; all: string } {
  const visible = [f.label, f.hints?.aria, f.hints?.placeholder].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  const attrs = [words(f.hints?.name), words(f.hints?.id)].filter(Boolean).join(" ").trim();
  return { visible, attrs, all: `${visible} ${attrs}`.trim() };
}

const HUMAN: [QuestionCategory, RegExp, string][] = [
  ["EEO", /\b(gender|sex\b|pronouns?|race|racial|ethnicity|ethnic|hispanic|latin[oa]|veteran|military status|disabilit|sexual orientation|lgbt|transgender|date of birth|birth ?date|\bdob\b|\bage\b|marital)/, "Equal-opportunity and demographic questions are yours alone to answer — or to decline."],
  ["LEGAL", /\b(criminal|convicted|conviction|felony|misdemeanou?r|background check|non-?compete|non-?solicit|i (hereby )?(certify|declare|attest|confirm|agree|acknowledge|consent)|terms (and|&) conditions|privacy (policy|notice)|signature|sign here|e-?sign|legally binding|declaration|drug test)/, "Legal declarations and consents need your own decision."],
  ["LEGAL", /\b(social security|\bssn\b|national (id|insurance)|passport|aadhaa?r|\bpan (card|number)\b|tax (id|file number)|driver'?s licen[cs]e|government id)/, "Government ID numbers are never filled by Wonder."],
  ["SPONSORSHIP", /\b(sponsor|sponsorship|h-?1b|visa (status|type|support|transfer))/, "Sponsorship is your answer to give — Wonder never assumes it."],
  ["WORK_AUTHORIZATION", /\b(authori[sz]ed to work|work authori[sz]ation|right to work|eligib(le|ility) to work|legally (eligible|permitted|able) to work|work permit|citizenship|citizen of|immigration status|residency status|permanent resident)/, "Work authorization is your answer to give — Wonder never assumes it."],
  ["CREDENTIAL", /\b(card number|credit card|debit card|\bcvv\b|\bcvc\b|expiry date|billing address|bank account|iban|routing number|upi id|crypto|wallet address)/, "Wonder never enters payment information."],
];

const AC_PROFILE: Record<string, ProfileKey> = {
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "address-level2": "city",
  "country-name": "country",
  country: "country",
  organization: "currentEmployer",
  "organization-title": "currentTitle",
  url: "websiteUrl",
};

type Rule = { re: RegExp; reject?: RegExp; key: ProfileKey; category: QuestionCategory };
const PROFILE_RULES: Rule[] = [
  { re: /\b(first|given) ?name\b|\bfname\b|\bforename\b/, reject: /preferred|legal first|middle|nick/, key: "firstName", category: "IDENTITY" },
  { re: /\b(last|family) ?name\b|\bsurname\b|\blname\b/, reject: /preferred|maiden/, key: "lastName", category: "IDENTITY" },
  { re: /\b(full ?name|your name|legal name|candidate name|applicant name)\b|^name\*?$|^name\b/, reject: /company|employer|user ?name|file|referr|school|univers|college|manager|recruiter|reference|emergency|preferred|nick|first|last|middle|sponsor|job|position|role/, key: "fullName", category: "IDENTITY" },
  { re: /e-?mail/, reject: /referr|reference|manager|recruiter|confirm your|emergency|alternate|secondary/, key: "email", category: "CONTACT" },
  { re: /\b(phone|mobile|telephone|cell|contact number|whatsapp)\b/, reject: /referr|reference|emergency|alternate|secondary|country code only/, key: "phone", category: "CONTACT" },
  { re: /linked ?in/, key: "linkedinUrl", category: "CONTACT" },
  { re: /git ?hub/, key: "githubUrl", category: "CONTACT" },
  { re: /\bportfolio\b/, reject: /upload|attach|file/, key: "portfolioUrl", category: "CONTACT" },
  { re: /\b(personal )?(website|web site|homepage|blog)\b|\bother url\b/, key: "websiteUrl", category: "CONTACT" },
  { re: /\bcity\b|\btown\b/, reject: /birth/, key: "city", category: "LOCATION" },
  { re: /\bcountry\b/, reject: /code|citizenship|birth|passport|authori/, key: "country", category: "LOCATION" },
  { re: /\b(current )?location\b|where are you (based|located)|\bbased in\b/, reject: /preferred|willing|relocat|office|job location/, key: "location", category: "LOCATION" },
  { re: /\bcurrent (company|employer)\b|\bemployer\b|\bcompany name\b|\borgani[sz]ation\b/, reject: /previous|past|former|referr|sponsor/, key: "currentEmployer", category: "EXPERIENCE" },
  { re: /\bcurrent (job )?(title|role|position)\b|\bjob title\b|\bheadline\b/, reject: /previous|past|former|desired|applying/, key: "currentTitle", category: "EXPERIENCE" },
];

const MEMORY_RULES: { re: RegExp; reject?: RegExp; key: MemoryKey; category: QuestionCategory }[] = [
  { re: /\b(salary|compensation|\bctc\b|pay expectation|desired pay|expected pay|remuneration|rate expectation)/, reject: /current|present|last drawn/, key: "salaryExpectation", category: "COMPENSATION" },
  { re: /\bnotice period\b|\bnotice\b/, key: "noticePeriod", category: "AVAILABILITY" },
  { re: /\b(start date|when can you start|earliest start|available to start|availability)\b/, key: "availability", category: "AVAILABILITY" },
  { re: /\breloca/, key: "relocation", category: "RELOCATION" },
  { re: /\b(remote|hybrid|on-?site|work arrangement|work model|work location preference|in the office)\b/, reject: /authori/, key: "workArrangement", category: "AVAILABILITY" },
  { re: /\btravel\b/, key: "travel", category: "AVAILABILITY" },
];

const MOTIVATION = /\b(why (do|would) you (want|like)|why are you interested|why (this|our) (company|role|team)|what (excites|interests|attracts) you|motivat|why .* join|cover letter)\b/;
const BEHAVIORAL = /\b(describe (a|an|your)|tell (us|me) about|give (us )?an example|a time (when|you)|biggest (achievement|challenge)|proudest|accomplishment|achievement)\b/;
const QUANTIFY = /\b(quantif|measurable|metric|impact in numbers|by how much|percentage|\bkpi)/;
const TECHNICAL = /\b(years of experience (with|in)|experience (with|in|using)|proficien|familiar with|hands-on|tech stack|programming|framework)\b/;

export function classifyField(f: ApplicationField, opts: { hasCoverLetter?: boolean } = {}): FieldClass {
  const { visible, attrs, all } = fieldText(f);
  const ac = (f.hints?.autocomplete ?? "").toLowerCase().trim().split(/\s+/).pop() ?? "";

  // 1. Never touched: credentials and one-time codes (§34, §47 "cannot access your passwords").
  if (f.type === "password" || /\b(password|passcode)\b/.test(all) || ac === "current-password" || ac === "new-password") {
    return { category: "CREDENTIAL", classification: "human-only", target: { kind: "none" }, confidence: "HIGH", reason: "Sign-in details are entered by you on the employer's site. Wonder never reads or stores them." };
  }
  if (f.type === "otp" || ac === "one-time-code" || /\b(one[- ]time (code|password)|verification code|otp|2fa|two[- ]factor|security code)\b/.test(all)) {
    return { category: "CREDENTIAL", classification: "human-only", target: { kind: "none" }, confidence: "HIGH", reason: "Verification codes are yours to enter. Wonder never reads them." };
  }
  if (ac.startsWith("cc-")) return { category: "CREDENTIAL", classification: "human-only", target: { kind: "none" }, confidence: "HIGH", reason: "Wonder never enters payment information." };

  // 2. Human-only questions (§21–§22) — recognised before anything that could look like a profile field.
  for (const [category, re, reason] of HUMAN) {
    if (re.test(visible) || (!visible && re.test(attrs))) return { category, classification: "human-only", target: { kind: "none" }, confidence: "HIGH", reason };
  }
  // A consent checkbox with a non-descript label is still a declaration.
  if (f.type === "checkbox" && /\b(agree|consent|confirm|accept|acknowledge)\b/.test(all)) {
    return { category: "LEGAL", classification: "human-only", target: { kind: "none" }, confidence: "HIGH", reason: "Consents and declarations need your own decision." };
  }

  // 3. Documents (§27–§30).
  if (f.type === "file") {
    if (/\b(resume|résumé|\bcv\b|curriculum)/.test(all)) return { category: "DOCUMENT", classification: "safe", target: { kind: "file", file: "resume" }, confidence: /additional|other|supporting/.test(all) ? "MEDIUM" : "HIGH" };
    if (/cover ?letter|motivation letter/.test(all)) return opts.hasCoverLetter ? { category: "DOCUMENT", classification: "safe", target: { kind: "file", file: "cover_letter" }, confidence: "HIGH" } : { category: "DOCUMENT", classification: "unknown", target: { kind: "none" }, confidence: "LOW", reason: "Your Application Pack has no cover letter for this role." };
    return { category: "DOCUMENT", classification: "unknown", target: { kind: "none" }, confidence: "LOW", reason: "Wonder isn't sure which document belongs here." };
  }
  if ((f.type === "textarea" || f.type === "text") && /cover ?letter/.test(all) && !MOTIVATION.test(visible.replace(/cover ?letter/g, ""))) {
    return opts.hasCoverLetter ? { category: "DOCUMENT", classification: "safe", target: { kind: "cover_text" }, confidence: "HIGH" } : { category: "CUSTOM_MOTIVATION", classification: "unknown", target: { kind: "draft" }, confidence: "LOW", reason: "Your Application Pack has no cover letter for this role." };
  }

  // 4. Profile facts, by autocomplete first (the page's own statement of what the field is).
  const acKey = AC_PROFILE[ac];
  if (acKey) return { category: acKey === "email" || acKey === "phone" || acKey === "websiteUrl" ? "CONTACT" : acKey === "city" || acKey === "country" ? "LOCATION" : acKey === "currentEmployer" || acKey === "currentTitle" ? "EXPERIENCE" : "IDENTITY", classification: "safe", target: { kind: "profile", key: acKey }, confidence: "HIGH" };

  if (/preferred (first )?name|nick ?name|middle name|maiden/.test(visible)) {
    return { category: "IDENTITY", classification: "unknown", target: { kind: "none" }, confidence: "LOW", reason: "Only you know how you'd like to be addressed." };
  }

  // 5. Volatile preferences — confirm before fill (§21, §85). Checked before profile rules so "expected salary (city)" isn't a city.
  for (const r of MEMORY_RULES) {
    if (r.re.test(visible) && !(r.reject && r.reject.test(visible))) return { category: r.category, classification: "confirm", target: { kind: "memory", key: r.key }, confidence: "LOW", reason: "Wonder asks before using this — it changes over time." };
  }
  if (/\b(current|present|last drawn) (salary|compensation|ctc|pay)\b/.test(visible)) {
    return { category: "COMPENSATION", classification: "confirm", target: { kind: "none" }, confidence: "LOW", reason: "Your current pay is yours to share or not." };
  }

  // 6. Profile facts by label (HIGH) or by attribute names only (MEDIUM — confirm first).
  for (const r of PROFILE_RULES) {
    if (r.re.test(visible) && !(r.reject && r.reject.test(visible))) return { category: r.category, classification: "safe", target: { kind: "profile", key: r.key }, confidence: "HIGH" };
  }
  if (f.type === "email") return { category: "CONTACT", classification: "safe", target: { kind: "profile", key: "email" }, confidence: visible ? "MEDIUM" : "HIGH" };
  if (f.type === "phone") return { category: "CONTACT", classification: "safe", target: { kind: "profile", key: "phone" }, confidence: "HIGH" };
  for (const r of PROFILE_RULES) {
    if (r.re.test(attrs) && !(r.reject && r.reject.test(attrs))) return { category: r.category, classification: "safe", target: { kind: "profile", key: r.key }, confidence: "MEDIUM", reason: "Wonder matched this field by its technical name only — confirm it's right." };
  }

  // 7. Open questions (§23–§26): Wonder may draft, the candidate decides.
  if (f.type === "textarea" || f.type === "text" || f.type === "unknown") {
    if (MOTIVATION.test(visible)) return { category: "CUSTOM_MOTIVATION", classification: "unknown", target: { kind: "draft" }, confidence: "LOW", reason: "Wonder can draft this from your Career Profile — you review it." };
    if (BEHAVIORAL.test(visible)) return { category: "BEHAVIORAL", classification: "unknown", target: QUANTIFY.test(visible) ? { kind: "metric" } : { kind: "draft" }, confidence: "LOW", reason: QUANTIFY.test(visible) ? "This asks for a measurable result — only you know the number." : "Wonder can draft this from your Career Profile — you review it." };
    if (TECHNICAL.test(visible)) return { category: "TECHNICAL", classification: "unknown", target: { kind: "draft" }, confidence: "LOW", reason: "Wonder can draft this from your Career Profile — you review it." };
  }
  if (/\b(school|universit|college|degree|qualification|education|gpa|graduat)/.test(visible)) return { category: "EDUCATION", classification: "confirm", target: { kind: "none" }, confidence: "LOW", reason: "Check this against your education in Career Profile." };
  if (/\byears of (professional )?experience\b|\bhow many years\b/.test(visible)) return { category: "EXPERIENCE", classification: "confirm", target: { kind: "none" }, confidence: "LOW", reason: "Confirm the number yourself — Wonder doesn't assume it." };
  if (/\bskills?\b/.test(visible)) return { category: "SKILLS", classification: "confirm", target: { kind: "none" }, confidence: "LOW", reason: "Pick the skills that apply." };
  return { category: "OTHER", classification: "unknown", target: { kind: "none" }, confidence: "UNKNOWN", reason: "Wonder isn't confident what this question needs." };
}

/** True when a label reads as a question the candidate should answer personally (used for intervention wording). */
export function isQuantifyQuestion(text: string): boolean {
  return QUANTIFY.test(text.toLowerCase());
}
