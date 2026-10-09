/**
 * Sensitive questions the candidate may let Wonder answer — only after turning a group on in Automation
 * (default off, with a confirmation), and only with answers they saved themselves. Nothing here is ever
 * inferred: an unanswered item, or a group that is off, leaves the question to the candidate.
 *
 * Groups (each its own capability, gated by resolveCapability):
 *  - fill_demographics: gender, pronouns, race/ethnicity, veteran and disability status;
 *  - fill_work_authorization: right to work and sponsorship, from the countries the candidate can work in;
 *  - fill_declarations: criminal-record questions and the form's consent/agree boxes;
 *  - fill_government_ids: PAN, Aadhaar, passport, SSN, national ID, driving licence numbers
 *    (stored encrypted on the server; a mapping carries only a marker, swapped for the number at fill time).
 * Never covered: passwords, verification codes, payment, signatures, date of birth.
 */
import { countryAliases } from "./places";

export const SENSITIVE_GROUPS = ["fill_demographics", "fill_work_authorization", "fill_declarations", "fill_government_ids"] as const;
export type SensitiveGroup = (typeof SENSITIVE_GROUPS)[number];

export const ID_KINDS = ["pan", "aadhaar", "passport", "ssn", "nationalId", "driversLicence"] as const;
export type IdKind = (typeof ID_KINDS)[number];

export const ID_LABEL: Record<IdKind, string> = { pan: "PAN", aadhaar: "Aadhaar", passport: "Passport number", ssn: "Social Security number", nationalId: "National ID", driversLicence: "Driving licence" };

export interface SensitiveAnswers {
  gender?: string;
  pronouns?: string;
  ethnicity?: string;
  veteran?: string;
  disability?: string;
  /** Countries the candidate may work in without sponsorship. */
  authorizedCountries?: string[];
  /** "No" / "Yes" — as the candidate answers "Have you been convicted…?". */
  criminalRecord?: string;
  /** The candidate agrees to the form's declarations and consents (tick boxes, "I agree"). */
  agreeDeclarations?: boolean;
}

export type SensitiveKey = "gender" | "pronouns" | "ethnicity" | "veteran" | "disability" | "authorized" | "sponsorship" | "criminalRecord" | "agree" | IdKind;
export interface SensitiveKind {
  group: SensitiveGroup;
  key: SensitiveKey;
}

/** What the pack carries into a form: the groups that are on, the candidate's answers, and which ID numbers exist (never the numbers). */
export interface PackSensitive {
  allowed: SensitiveGroup[];
  answers: SensitiveAnswers;
  ids: IdKind[];
  /** The candidate's own country (from their location) — "authorized to work?" without a country means here. */
  homeCountry?: string;
}

const RULES: [RegExp, SensitiveKind, RegExp?][] = [
  [/\bpronouns?\b/, { group: "fill_demographics", key: "pronouns" }],
  [/\b(gender|sex)\b/, { group: "fill_demographics", key: "gender" }, /\bsexual orientation\b/],
  [/\b(race|racial|ethnicity|ethnic|hispanic|latin[oa])/, { group: "fill_demographics", key: "ethnicity" }],
  [/\b(veteran|military status)/, { group: "fill_demographics", key: "veteran" }],
  [/\bdisabilit/, { group: "fill_demographics", key: "disability" }],
  [/\b(sponsor|sponsorship|h-?1b|visa (status|type|support|transfer))/, { group: "fill_work_authorization", key: "sponsorship" }],
  [/\b(authori[sz]ed to work|work authori[sz]ation|right to work|eligib(le|ility) to work|legally (eligible|permitted|able) to work|work permit)/, { group: "fill_work_authorization", key: "authorized" }],
  [/\b(criminal|convicted|conviction|felony|misdemeanou?r)\b/, { group: "fill_declarations", key: "criminalRecord" }],
  [/\b(i (hereby )?(certify|declare|attest|confirm|agree|acknowledge|consent)|terms (and|&) conditions|privacy (policy|notice)|declaration|background check|agree|consent|acknowledge)\b/, { group: "fill_declarations", key: "agree" }, /\b(signature|sign here|e-?sign|drug test|non-?compete|non-?solicit)\b/],
  [/\bpan (card|number|no)\b|\bpermanent account number\b|^pan\b/, { group: "fill_government_ids", key: "pan" }],
  [/\baadhaa?r\b/, { group: "fill_government_ids", key: "aadhaar" }],
  [/\bpassport\b/, { group: "fill_government_ids", key: "passport" }, /\b(country|expiry|expiration|issue|valid|do you have|copy|upload)\b/],
  [/\b(social security|\bssn\b)/, { group: "fill_government_ids", key: "ssn" }],
  [/\bnational (id|identity|insurance)\b/, { group: "fill_government_ids", key: "nationalId" }],
  [/\bdriver'?s? licen[cs]e\b|\bdriving licen[cs]e\b/, { group: "fill_government_ids", key: "driversLicence" }, /\b(do you have|valid|class|type|state|expiry)\b/],
];

/** Which sensitive item a question asks for, if one this feature can ever answer. */
export function sensitiveKindOf(text: string): SensitiveKind | undefined {
  const t = text.toLowerCase();
  for (const [re, kind, reject] of RULES) if (re.test(t) && !(reject && reject.test(t))) return kind;
  return undefined;
}

const COUNTRY_WORDS = ["india", "united states", "usa", "us", "united kingdom", "uk", "canada", "australia", "singapore", "germany", "netherlands", "united arab emirates", "uae", "ireland", "france", "japan", "new zealand"];

/** The country a work-authorization question is about: the one it names, else the candidate's own. */
function countryAsked(text: string, home?: string): string | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-z ]+/g, " ")} `;
  const named = COUNTRY_WORDS.find((c) => t.includes(` ${c} `));
  return named ?? home;
}

const authorizedFor = (answers: SensitiveAnswers, country: string | undefined) => {
  if (!country || !answers.authorizedCountries?.length) return undefined;
  const asked = countryAliases(country);
  return answers.authorizedCountries.some((c) => countryAliases(c).some((a) => asked.includes(a)));
};

/**
 * The candidate's own answer to a sensitive question, as words ("Yes", "Female", "checked") — or undefined
 * when they haven't saved one. ID numbers are never resolved here (see ID_MARKER).
 */
export function sensitiveAnswer(kind: SensitiveKind, questionText: string, s: PackSensitive, fieldType: string): string | undefined {
  const a = s.answers;
  switch (kind.key) {
    case "gender":
    case "pronouns":
    case "ethnicity":
    case "veteran":
    case "disability":
      return a[kind.key]?.trim() || undefined;
    case "authorized": {
      const ok = authorizedFor(a, countryAsked(questionText, s.homeCountry));
      return ok === undefined ? undefined : ok ? "Yes" : "No";
    }
    case "sponsorship": {
      // "Will you require sponsorship?" — needed exactly where the candidate isn't already authorized.
      const ok = authorizedFor(a, countryAsked(questionText, s.homeCountry));
      return ok === undefined ? undefined : ok ? "No" : "Yes";
    }
    case "criminalRecord":
      return a.criminalRecord?.trim() || undefined;
    case "agree":
      if (a.agreeDeclarations !== true) return undefined;
      return fieldType === "checkbox" ? "checked" : "Yes";
    default:
      return s.ids.includes(kind.key) ? idMarker(kind.key) : undefined;
  }
}

/** A mapping holds this in place of an ID number; the server swaps in the decrypted number only when building a fill. */
export const ID_MARKER = "\u0000wj-id:";
export const idMarker = (k: IdKind) => `${ID_MARKER}${k}`;
export const markedId = (value: string | undefined): IdKind | undefined => (value?.startsWith(ID_MARKER) ? (value.slice(ID_MARKER.length) as IdKind) : undefined);
