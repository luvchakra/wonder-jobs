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

/** The part of the form a field sits in, when the page or its neighbours say: "Start date" under Education is the course's start, not the candidate's. */
export type FormContext = "education" | "experience" | "address";

export interface FieldClass {
  category: QuestionCategory;
  classification: Classification;
  target: FieldTarget;
  confidence: Confidence;
  /** Plain-language reason shown when Wonder leaves a field for the candidate. */
  reason?: string;
  /** The section the field was read in, when that decided what it asks. */
  context?: FormContext;
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
  "street-address": "addressLine1",
  "address-line1": "addressLine1",
  "address-line2": "addressLine2",
  "address-level2": "city",
  "address-level1": "state",
  "postal-code": "postalCode",
  "country-name": "country",
  country: "country",
  organization: "currentEmployer",
  "organization-title": "currentTitle",
  url: "websiteUrl",
};

type Rule = { re: RegExp; reject?: RegExp; key: ProfileKey; category: QuestionCategory };
const CATEGORY_OF: Partial<Record<ProfileKey, QuestionCategory>> = {
  email: "CONTACT",
  phone: "CONTACT",
  phoneCountryCode: "CONTACT",
  phoneNational: "CONTACT",
  websiteUrl: "CONTACT",
  linkedinUrl: "CONTACT",
  portfolioUrl: "CONTACT",
  githubUrl: "CONTACT",
  addressLine1: "LOCATION",
  addressLine2: "LOCATION",
  city: "LOCATION",
  state: "LOCATION",
  postalCode: "LOCATION",
  country: "LOCATION",
  location: "LOCATION",
  currentEmployer: "EXPERIENCE",
  currentTitle: "EXPERIENCE",
  jobStartDate: "EXPERIENCE",
  jobEndDate: "EXPERIENCE",
  hasWorkExperience: "EXPERIENCE",
  yearsOfExperience: "EXPERIENCE",
  university: "EDUCATION",
  degreeName: "EDUCATION",
  degreeType: "EDUCATION",
  fieldOfStudy: "EDUCATION",
  educationStartDate: "EDUCATION",
  educationEndDate: "EDUCATION",
};
const categoryOf = (k: ProfileKey): QuestionCategory => CATEGORY_OF[k] ?? "IDENTITY";

/** What a section heading says the part of the form is about. */
export function contextOfSection(section: string | undefined): FormContext | undefined {
  const t = (section ?? "").toLowerCase();
  if (!t) return undefined;
  if (/\b(education|academic|qualifications?|school|universit|degree)/.test(t)) return "education";
  if (/\b(work experience|experience|employment|work history|career history|previous (jobs|roles|employers)|job history|positions? held)\b/.test(t)) return "experience";
  if (/\baddress\b/.test(t)) return "address";
  return undefined;
}

/** Education facts, asked in any part of the form. Order matters: "Type of degree" before "Degree". */
const EDUCATION_RULES: Rule[] = [
  { re: /\b(type of (degree|qualification|education)|degree type|degree level|level of (education|degree|study|qualification)|highest (level of )?(education|degree|qualification|academic)|education(al)? (level|qualification|attainment)|qualification level)\b/, reject: /\b(gpa|grade|percentage|year|date|universit|college|school name)\b/, key: "degreeType", category: "EDUCATION" },
  { re: /\b(graduation (date|year)|year of (passing|completion|graduation)|passing year|passed out|date of graduation|graduated (in|on)|when did you graduate)\b/, key: "educationEndDate", category: "EDUCATION" },
  { re: /\b(universit(y|ies)|college|institut(e|ion)|alma mater|school or university|school name|name of (the )?school)\b/, reject: /\b(high school|secondary|type|level|degree|gpa|grade|percentage|city|country|location|state|address|year|date|email|e-mail)\b/, key: "university", category: "EDUCATION" },
  { re: /\b(field of study|fields? of (study|education)|major|speciali[sz](ation|ed in)|discipline|area of study|concentration|course of study|stream of study)\b/, reject: /\b(accomplish|achievement|project|bank|minor|incident)\b/, key: "fieldOfStudy", category: "EDUCATION" },
  { re: /\b(degree|qualification|diploma)( name| title| obtained| earned| awarded| received)?\b/, reject: /\b(type|level|highest|gpa|grade|class|percentage|year|date|universit|college|school|field|major|required|minimum|do you have|360)\b/, key: "degreeName", category: "EDUCATION" },
];

/** "Do you have past working experience?" — not "experience with Python", not "worked for us before". */
const HAS_EXPERIENCE = /\b(do|did) you have (any )?((past|previous|prior|professional|full[- ]time|paid|relevant) )*(work(ing)?|professional|employment|job|industry) experience\b|\bhave you (ever )?(been (gainfully )?employed|worked)( before| previously)?\s*[?*:]*\s*$/;
const HAS_EXPERIENCE_NOT = /experience (in|with|using|as|at|of|on|for)\b|\b(us|our|this company|here)\b/;
const TOTAL_YEARS = /\b(total|overall) (years of )?(work |professional |relevant |industry )?(experience|exp)\b|\byears of (total |overall |professional |work )?experience\s*[?*:]*\s*$|\bhow many years (of (professional |work )?experience )?(have you (been )?(worked|working)|do you have)\s*[?*:]*\s*$|\bexperience \(in years\)|\bexperience in years\b/;
const TOTAL_YEARS_NOT = /experience (in|with|using|as|on|of) [a-z]/;

const AVAILABILITY_DATE = /\b(when can you|earliest|expected|preferred|available|availability|joining date|date of joining|can (you )?join|notice)\b/;
const START = /\b(start|from|begin|began|commenced|joined|since)\b/;
const END = /\b(end|to|until|till|finish(ed)?|completed?|completion|graduat\w*|left|leaving)\b/;

/** A field whose meaning comes from the section it's in: dates, a bare "Name" or "Title", "Line 1". */
function byContext(f: ApplicationField, visible: string, ctx: FormContext | undefined, strong: boolean): FieldClass | undefined {
  if (!ctx || f.type === "checkbox") return undefined;
  const confidence: Confidence = strong ? "HIGH" : "MEDIUM";
  const reason = strong ? undefined : "Wonder read this from the fields around it — confirm it's right.";
  const hit = (key: ProfileKey): FieldClass => ({ category: categoryOf(key), classification: "safe", target: { kind: "profile", key }, confidence, reason, context: ctx });
  const dateish = f.type === "date" || /\b(date|month|year)\b/.test(visible) || /^(from|to|since|until|start|end)\b/.test(visible);
  // Where the school or the job was — not where the candidate lives.
  if (strong && ctx !== "address" && /\b(city|town|country|location|state|province)\b/.test(visible) && !dateish) {
    return { category: categoryOf(ctx === "education" ? "university" : "currentEmployer"), classification: "confirm", target: { kind: "none" }, confidence: "LOW", reason: ctx === "education" ? "Where you studied — check it yourself." : "Where this job was — check it yourself.", context: ctx };
  }
  if (ctx === "education") {
    if (dateish && !AVAILABILITY_DATE.test(visible)) {
      if (START.test(visible)) return hit("educationStartDate");
      if (END.test(visible)) return hit("educationEndDate");
    }
    if (/^(name|institution|school)\b/.test(visible)) return hit("university");
    if (/^(course|field|subject|branch|stream)\b/.test(visible)) return hit("fieldOfStudy");
  }
  if (ctx === "experience") {
    if (dateish && !AVAILABILITY_DATE.test(visible)) {
      if (START.test(visible)) return hit("jobStartDate");
      if (END.test(visible)) return hit("jobEndDate");
    }
    if (/\b(job title|title|position|role|designation)\b/.test(visible) && !/\b(desired|applying|preferred)\b/.test(visible)) return hit("currentTitle");
    if (/\b(company|employer|organi[sz]ation)\b/.test(visible)) return hit("currentEmployer");
  }
  if (ctx === "address") {
    if (/\bline ?1\b|^street\b|^address\b/.test(visible)) return hit("addressLine1");
    if (/\bline ?2\b/.test(visible)) return hit("addressLine2");
  }
  return undefined;
}

const PROFILE_RULES: Rule[] = [
  { re: /\b(first|given) ?name\b|\bfname\b|\bforename\b/, reject: /preferred|legal first|middle|nick/, key: "firstName", category: "IDENTITY" },
  { re: /\b(last|family) ?name\b|\bsurname\b|\blname\b/, reject: /preferred|maiden/, key: "lastName", category: "IDENTITY" },
  { re: /\b(full ?name|your name|legal name|candidate name|applicant name)\b|^name\*?$|^name\b/, reject: /company|employer|user ?name|file|referr|school|univers|college|institut|degree|manager|recruiter|reference|emergency|preferred|nick|first|last|middle|sponsor|job|position|role/, key: "fullName", category: "IDENTITY" },
  { re: /e-?mail/, reject: /referr|reference|manager|recruiter|confirm your|emergency|alternate|secondary/, key: "email", category: "CONTACT" },
  { re: /\b(country (phone )?code|phone (country )?code|dial(ling)? code|calling code|isd code|country calling)\b/, key: "phoneCountryCode", category: "CONTACT" },
  { re: /\b(phone|mobile|telephone|cell|contact number|whatsapp)\b/, reject: /referr|reference|emergency|alternate|secondary|country code only|\bcode\b|extension/, key: "phone", category: "CONTACT" },
  { re: /linked ?in/, key: "linkedinUrl", category: "CONTACT" },
  { re: /git ?hub/, key: "githubUrl", category: "CONTACT" },
  { re: /\bportfolio\b/, reject: /upload|attach|file/, key: "portfolioUrl", category: "CONTACT" },
  { re: /\b(personal )?(website|web site|homepage|blog)\b|\bother url\b/, key: "websiteUrl", category: "CONTACT" },
  { re: /\baddress (line )?2\b|\bapartment\b|\bsuite\b|\bapt\b/, reject: /e-?mail|web|url|\bip\b|billing/, key: "addressLine2", category: "LOCATION" },
  { re: /\baddress (line )?1\b|\bstreet( address)?\b|\b(residential|home|current|permanent|postal|mailing|correspondence|street) address\b|^address\b/, reject: /e-?mail|web|url|\bip\b|billing|\bmac\b|line 2/, key: "addressLine1", category: "LOCATION" },
  { re: /\b(zip|postal|post ?code|postcode|pin ?code|pincode)\b/, reject: /country code|phone/, key: "postalCode", category: "LOCATION" },
  { re: /\b(state|province|county|prefecture|territory)\b|^region\b/, reject: /statement|united states|state of|status|estate|authori|eligib|visa|citizen|willing|relocat|preferred|which states/, key: "state", category: "LOCATION" },
  { re: /\bcity\b|\btown\b/, reject: /birth/, key: "city", category: "LOCATION" },
  { re: /\bcountry\b/, reject: /code|citizenship|birth|passport|authori/, key: "country", category: "LOCATION" },
  { re: /\b(current )?location\b|where are you (based|located)|\bbased in\b/, reject: /preferred|willing|relocat|office|job location/, key: "location", category: "LOCATION" },
  { re: /\bcurrent (company|employer)\b|\bemployer\b|\bcompany name\b|\borgani[sz]ation\b/, reject: /previous|past|former|referr|sponsor/, key: "currentEmployer", category: "EXPERIENCE" },
  { re: /\bcurrent (job )?(title|role|position)\b|\bjob title\b|\bheadline\b/, reject: /previous|past|former|desired|applying/, key: "currentTitle", category: "EXPERIENCE" },
];

const MEMORY_RULES: { re: RegExp; reject?: RegExp; key: MemoryKey; category: QuestionCategory }[] = [
  { re: /\b(current|present|last drawn|existing) (annual )?(salary|compensation|ctc|pay)\b|\bcurrent ctc\b|\bctc \(current\)/, key: "currentSalary", category: "COMPENSATION" },
  { re: /\bemployment status\b|\bare you (currently )?(employed|working)\b|\bcurrently (employed|working)\?|\bjob status\b/, key: "employmentStatus", category: "AVAILABILITY" },
  { re: /\b(salary|compensation|\bctc\b|pay expectation|desired pay|expected pay|remuneration|rate expectation)/, reject: /current|present|last drawn/, key: "salaryExpectation", category: "COMPENSATION" },
  { re: /\bnotice period\b|\bnotice\b/, key: "noticePeriod", category: "AVAILABILITY" },
  { re: /\b(start date|when can you start|earliest start|available to start|availability)\b/, key: "availability", category: "AVAILABILITY" },
  { re: /\breloca/, key: "relocation", category: "RELOCATION" },
  { re: /\b(remote|hybrid|on-?site|work arrangement|work model|work location preference|in the office)\b/, reject: /authori/, key: "workArrangement", category: "AVAILABILITY" },
  { re: /\btravel\b/, key: "travel", category: "AVAILABILITY" },
];

/** The remembered answer a free-text question is about ("What is your notice period?" → noticePeriod), if any. */
export function memoryKeyFor(question: string): MemoryKey | undefined {
  const q = question.toLowerCase();
  if (/\b(work authori[sz]ation|authori[sz]ed to work|right to work|legally (able|eligible))\b/.test(q)) return "workAuthorization";
  if (/\bsponsor/.test(q)) return "sponsorship";
  return MEMORY_RULES.find((r) => r.re.test(q) && !(r.reject && r.reject.test(q)))?.key;
}

const MOTIVATION = /\b(why (do|would) you (want|like)|why are you interested|why (this|our) (company|role|team)|what (excites|interests|attracts) you|motivat|why .* join|cover letter)\b/;
const BEHAVIORAL = /\b(describe (a|an|your)|tell (us|me) about|give (us )?an example|a time (when|you)|biggest (achievement|challenge)|proudest|accomplishment|achievement)\b/;
const QUANTIFY = /\b(quantif|measurable|metric|impact in numbers|by how much|percentage|\bkpi)/;
const TECHNICAL = /\b(years of experience (with|in)|experience (with|in|using)|proficien|familiar with|hands-on|tech stack|programming|framework)\b/;

export function classifyField(f: ApplicationField, opts: { hasCoverLetter?: boolean; context?: FormContext } = {}): FieldClass {
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
  if (acKey) return { category: categoryOf(acKey), classification: "safe", target: { kind: "profile", key: acKey }, confidence: "HIGH" };

  if (/preferred (first )?name|nick ?name|middle name|maiden/.test(visible)) {
    return { category: "IDENTITY", classification: "unknown", target: { kind: "none" }, confidence: "LOW", reason: "Only you know how you'd like to be addressed." };
  }

  // 4b. Where the field sits decides what a bare "Start date", "Name" or "Line 1" means. The page's own section
  // heading is a strong signal; the fields around it (worked out by the mapper) are a weaker one.
  const sectionCtx = contextOfSection(f.hints?.section);
  const inContext = byContext(f, visible, sectionCtx ?? opts.context, !!sectionCtx);
  if (inContext) return inContext;
  if (f.type !== "checkbox") {
    for (const r of EDUCATION_RULES) {
      if (r.re.test(visible) && !(r.reject && r.reject.test(visible))) return { category: "EDUCATION", classification: "safe", target: { kind: "profile", key: r.key }, confidence: "HIGH" };
    }
    if (HAS_EXPERIENCE.test(visible) && !HAS_EXPERIENCE_NOT.test(visible)) return { category: "EXPERIENCE", classification: "safe", target: { kind: "profile", key: "hasWorkExperience" }, confidence: "HIGH" };
    // Counted from the role dates — offered for the candidate to confirm, never filled on its own.
    if (TOTAL_YEARS.test(visible) && !TOTAL_YEARS_NOT.test(visible)) return { category: "EXPERIENCE", classification: "confirm", target: { kind: "profile", key: "yearsOfExperience" }, confidence: "LOW", reason: "Counted from the dates in your Career Profile — confirm the number." };
  }

  // 5. Volatile preferences — confirm before fill (§21, §85). Checked before profile rules so "expected salary (city)" isn't a city.
  // A tick box that merely mentions salary ("show my salary to employers") isn't the salary question.
  for (const r of f.type === "checkbox" ? [] : MEMORY_RULES) {
    if (r.re.test(visible) && !(r.reject && r.reject.test(visible))) return { category: r.category, classification: "confirm", target: { kind: "memory", key: r.key }, confidence: "LOW", reason: "Saved in your Career Profile within 30 days: filled. Otherwise Wonder asks — it changes over time." };
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
