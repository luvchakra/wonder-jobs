/**
 * The Application Profile (spec §7): what JobsApply may put into a form, each value with where it
 * came from. Built only from the candidate's own Career Profile and account — never inferred to fill
 * a gap. A value that doesn't exist is simply absent, and the form field becomes "Needs you".
 */
import type { CareerDNA } from "@/domain/career/types";
import { historyOf, sortExperience, type FactProvenance } from "@/domain/career/history";
import { stateForCity } from "./places";
import type { ApplicationProfile, ApplicationValue, EducationFact, ExperienceFact, MemoryKey, RememberedAnswer, ValueProvenance } from "./types";

const FROM_FACT: Record<FactProvenance, ValueProvenance> = {
  USER_PROVIDED: "USER_PROVIDED",
  RESUME_IMPORTED: "RESUME_IMPORTED",
  LINKEDIN_IMPORTED: "LINKEDIN_IMPORTED",
  USER_CONFIRMED: "USER_CONFIRMED",
};

const v = (value: string | undefined, provenance: ValueProvenance, confidence = 1): ApplicationValue | undefined => {
  const s = value?.trim();
  return s ? { value: s, provenance, confidence } : undefined;
};

/** "Priya Raman Iyer" → first "Priya", last "Raman Iyer". One word is a first name with no surname — never a made-up one. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** A degree's level, read from its own words: "B.Tech." → "Bachelor's", "MBA" → "Master's". Undefined when the words don't say. */
export function degreeLevel(degree: string | undefined): string | undefined {
  const d = (degree ?? "").toLowerCase();
  if (!d.trim()) return undefined;
  if (/\b(ph\.?\s?d|d\.?\s?phil|doctor(ate)?|doctoral)\b/.test(d)) return "Doctorate";
  if (/\b(master|masters|mba|m\.?b\.?a|post ?grad\w*|pgd\w*|llm|mphil|mtech|msc|m\.?\s?(tech|e|sc|s|a|com|ca|des|arch|phil|eng)\b)/.test(d)) return "Master's";
  if (/\b(bachelor\w*|undergrad\w*|btech|bsc|bba|bca|bcom|llb|mbbs|b\.?\s?(tech|e|sc|s|a|com|ba|ca|arch|des|pharm|eng)\b)/.test(d)) return "Bachelor's";
  if (/\bassociate\b/.test(d)) return "Associate";
  if (/\bdiploma\b/.test(d)) return "Diploma";
  if (/\b(high school|secondary|hsc|ssc|12th|10th|a-?levels?)\b/.test(d)) return "High school";
  return undefined;
}

const LEVEL_RANK: Record<string, number> = { Doctorate: 6, "Master's": 5, "Bachelor's": 4, Associate: 3, Diploma: 2, "High school": 1 };

/** Every education entry, highest level first, then most recent. */
export function educationFacts(dna: CareerDNA): EducationFact[] {
  return historyOf(dna)
    .education.filter((e) => e.institution?.trim())
    .map((e) => ({ institution: e.institution.trim(), degree: e.degree?.trim() || undefined, degreeType: degreeLevel(e.degree), field: e.field?.trim() || undefined, startDate: e.startDate || undefined, endDate: e.endDate || undefined, provenance: FROM_FACT[e.provenance] }))
    .sort((a, b) => (LEVEL_RANK[b.degreeType ?? ""] ?? 0) - (LEVEL_RANK[a.degreeType ?? ""] ?? 0) || (b.endDate ?? b.startDate ?? "").localeCompare(a.endDate ?? a.startDate ?? ""));
}

/** Every role, most recent first. */
export function experienceFacts(dna: CareerDNA): ExperienceFact[] {
  return sortExperience(historyOf(dna).experience)
    .filter((e) => e.employer?.trim() || e.title?.trim())
    .map((e) => ({ employer: e.employer.trim(), title: e.title.trim(), location: e.location?.trim() || undefined, startDate: e.startDate || undefined, endDate: e.current ? undefined : e.endDate || undefined, current: e.current || undefined, provenance: FROM_FACT[e.provenance] }));
}

const monthIndex = (d: string): number | undefined => {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(d);
  return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0) : undefined;
};

/** Whole years worked, counting overlapping roles once. Undefined when any role has no start date. */
export function yearsWorked(roles: ExperienceFact[], now = Date.now()): number | undefined {
  if (!roles.length) return undefined;
  const d = new Date(now);
  const today = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const spans: [number, number][] = [];
  for (const r of roles) {
    const a = r.startDate ? monthIndex(r.startDate) : undefined;
    if (a === undefined) return undefined;
    const b = r.current || !r.endDate ? today : (monthIndex(r.endDate) ?? today);
    spans.push([a, Math.max(a, b)]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let months = 0;
  let [s, e] = spans[0];
  for (const [a, b] of spans.slice(1)) {
    if (a <= e) e = Math.max(e, b);
    else {
      months += e - s;
      [s, e] = [a, b];
    }
  }
  months += e - s;
  return Math.floor(months / 12);
}

export function buildApplicationProfile(dna: CareerDNA, opts: { accountEmail?: string; now?: number } = {}): ApplicationProfile {
  const h = historyOf(dna);
  const c = h.contact;
  const p: ApplicationProfile = {};
  const put = (k: keyof ApplicationProfile, val: ApplicationValue | undefined) => {
    if (val) p[k] = val;
  };

  const name = dna.name?.trim() ?? "";
  put("fullName", v(name, "USER_PROVIDED"));
  const { firstName, lastName } = splitName(name);
  // Splitting a name is a rule, not a fact — slightly less than certain, still the candidate's own words.
  put("firstName", v(firstName, "USER_PROVIDED", lastName ? 0.95 : 0.9));
  put("lastName", v(lastName, "USER_PROVIDED", 0.95));

  // The account's sign-in email is verified by the auth provider; a Career Profile email is the candidate's own.
  put("email", v(c.email, "USER_PROVIDED") ?? v(opts.accountEmail, "VERIFIED"));
  put("phone", v(c.phone, "USER_PROVIDED"));
  put("linkedinUrl", v(c.linkedinUrl, "USER_PROVIDED"));
  put("portfolioUrl", v(c.portfolioUrl, "USER_PROVIDED"));
  put("websiteUrl", v(c.websiteUrl, "USER_PROVIDED"));
  const gh = [c.websiteUrl, c.portfolioUrl].find((u) => u && /github\.com\//i.test(u));
  put("githubUrl", v(gh, "USER_PROVIDED"));

  put("addressLine1", v(c.addressLine1, "USER_PROVIDED"));
  put("addressLine2", v(c.addressLine2, "USER_PROVIDED"));
  put("postalCode", v(c.postalCode, "USER_PROVIDED"));
  put("state", v(c.state, "USER_PROVIDED"));
  if (c.location?.trim()) {
    put("location", v(c.location, "USER_PROVIDED"));
    const parts = c.location.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      put("city", v(parts[0], "USER_PROVIDED", 0.9));
      put("country", v(parts[parts.length - 1], "USER_PROVIDED", 0.85));
      // "Pune, Maharashtra, India": the middle part is the state. "Mumbai, India": the city's state, from a fixed gazetteer.
      if (!p.state && parts.length >= 3) put("state", v(parts[parts.length - 2], "USER_PROVIDED", 0.85));
      if (!p.state) put("state", v(stateForCity(parts[0], parts[parts.length - 1]), "AI_DERIVED", 0.85));
    }
  }

  const roles = experienceFacts(dna);
  const latest = roles[0];
  if (latest && (latest.current || !latest.endDate)) {
    put("currentEmployer", v(latest.employer, latest.provenance));
    put("currentTitle", v(latest.title, latest.provenance));
  }
  if (latest) {
    put("jobStartDate", v(latest.startDate, latest.provenance));
    put("jobEndDate", v(latest.endDate, latest.provenance));
    // Roles in the Career Profile answer "Do you have work experience?"; their absence is not a "No".
    put("hasWorkExperience", v("Yes", latest.provenance, 0.95));
    // Counted from the role dates — a calculation the candidate confirms, never filled on its own.
    const years = yearsWorked(roles, opts.now);
    if (years !== undefined) put("yearsOfExperience", v(String(years), "AI_DERIVED", 0.8));
  }

  const edu = educationFacts(dna)[0];
  if (edu) {
    put("university", v(edu.institution, edu.provenance));
    put("degreeName", v(edu.degree, edu.provenance));
    put("degreeType", v(edu.degreeType, "AI_DERIVED", 0.9));
    put("fieldOfStudy", v(edu.field, edu.provenance));
    put("educationStartDate", v(edu.startDate, edu.provenance));
    put("educationEndDate", v(edu.endDate, edu.provenance));
  }
  return p;
}

/** Commonly asked fields the profile doesn't hold — shown on the checklist so the candidate knows before opening the form. */
export function missingProfileFields(p: ApplicationProfile): string[] {
  const out: string[] = [];
  if (!p.fullName) out.push("Your name");
  if (!p.email) out.push("Email");
  if (!p.phone) out.push("Phone number");
  if (!p.linkedinUrl) out.push("LinkedIn profile");
  if (!p.location) out.push("Location");
  return out;
}

/** Answers that go stale (§85): ask again after this many days. */
export const MEMORY_STALE_DAYS = 30;

export const MEMORY_LABEL: Record<MemoryKey, string> = {
  salaryExpectation: "Expected salary",
  currentSalary: "Current salary",
  employmentStatus: "Employment status",
  noticePeriod: "Notice period",
  relocation: "Relocation",
  workArrangement: "Work arrangement",
  travel: "Willingness to travel",
  availability: "Availability / start date",
  workAuthorization: "Work authorization",
  sponsorship: "Sponsorship",
  custom: "Your answer",
};

/** A saved answer the candidate confirmed within the last MEMORY_STALE_DAYS (Wonder fills it), or undefined when it's missing or stale (Wonder asks). */
export function freshMemory(memory: RememberedAnswer[], key: MemoryKey, now = Date.now()): RememberedAnswer | undefined {
  const m = memory.filter((x) => x.key === key).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0];
  if (!m) return undefined;
  const age = (now - new Date(m.confirmedAt).getTime()) / 86_400_000;
  return age <= MEMORY_STALE_DAYS ? m : undefined;
}

export const PROFILE_LABEL: Record<keyof ApplicationProfile, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State / province",
  postalCode: "Postal code",
  country: "Country",
  location: "Location",
  linkedinUrl: "LinkedIn",
  portfolioUrl: "Portfolio",
  githubUrl: "GitHub",
  websiteUrl: "Website",
  currentEmployer: "Current employer",
  currentTitle: "Current title",
  jobStartDate: "Start date (latest role)",
  jobEndDate: "End date (latest role)",
  hasWorkExperience: "Has work experience",
  yearsOfExperience: "Total years of experience",
  university: "University / school",
  degreeName: "Degree",
  degreeType: "Degree level",
  fieldOfStudy: "Field of study",
  educationStartDate: "Education start date",
  educationEndDate: "Education end / graduation date",
};

export const PROVENANCE_LABEL: Record<ValueProvenance | "AI_GENERATED" | "USER_MODIFIED", string> = {
  VERIFIED: "Verified (your sign-in email)",
  USER_PROVIDED: "From your Career Profile",
  RESUME_IMPORTED: "From your résumé",
  LINKEDIN_IMPORTED: "From LinkedIn",
  USER_CONFIRMED: "Confirmed by you",
  AI_DERIVED: "Derived by Wonder",
  AI_SUGGESTED: "AI-suggested",
  AI_GENERATED: "AI-generated draft",
  USER_MODIFIED: "AI draft edited by you",
};
