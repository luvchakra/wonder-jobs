/**
 * The Application Profile (spec §7): what JobsApply may put into a form, each value with where it
 * came from. Built only from the candidate's own Career Profile and account — never inferred to fill
 * a gap. A value that doesn't exist is simply absent, and the form field becomes "Needs you".
 */
import type { CareerDNA } from "@/domain/career/types";
import { historyOf, sortExperience, type FactProvenance } from "@/domain/career/history";
import type { ApplicationProfile, ApplicationValue, MemoryKey, RememberedAnswer, ValueProvenance } from "./types";

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

export function buildApplicationProfile(dna: CareerDNA, opts: { accountEmail?: string } = {}): ApplicationProfile {
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

  if (c.location?.trim()) {
    put("location", v(c.location, "USER_PROVIDED"));
    const parts = c.location.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      put("city", v(parts[0], "USER_PROVIDED", 0.9));
      put("country", v(parts[parts.length - 1], "USER_PROVIDED", 0.85));
    }
  }

  const latest = sortExperience(h.experience)[0];
  if (latest && (latest.current || !latest.endDate)) {
    put("currentEmployer", v(latest.employer, FROM_FACT[latest.provenance]));
    put("currentTitle", v(latest.title, FROM_FACT[latest.provenance]));
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
  noticePeriod: "Notice period",
  relocation: "Relocation",
  workArrangement: "Work arrangement",
  travel: "Willingness to travel",
  availability: "Availability / start date",
  workAuthorization: "Work authorization",
  sponsorship: "Sponsorship",
};

/** A remembered answer Wonder may *offer* (never fill on its own), or undefined when it's missing or stale. */
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
  city: "City",
  country: "Country",
  location: "Location",
  linkedinUrl: "LinkedIn",
  portfolioUrl: "Portfolio",
  githubUrl: "GitHub",
  websiteUrl: "Website",
  currentEmployer: "Current employer",
  currentTitle: "Current title",
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
