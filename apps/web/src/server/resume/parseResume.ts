/**
 * Turning a resume into a Career DNA *suggestion*.
 *
 * Deliberately deterministic and explainable, built on the same helpers that read job postings
 * (`services/jobs/normalize.ts`) — the same lexicon on both sides is what makes a skill found in a
 * resume actually match a skill found in a posting. Nothing here is written to anyone's profile: the
 * result is a draft the candidate reviews field by field, with the line of the resume each value came
 * from, so a wrong guess costs a glance rather than a bad match.
 */
import { INDUSTRIES, type CareerDNA } from "@/domain/career/types";
import { extractSkills, inferSeniority, SKILL_LEXICON } from "@/services/jobs/normalize";

export type ResumeField = "name" | "headline" | "yearsExperience" | "seniority" | "skills" | "industries" | "preferredLocations";

export interface ResumeDraft {
  name?: string;
  headline?: string;
  yearsExperience?: number;
  seniority?: CareerDNA["seniority"];
  skills?: { name: string; level: 1 | 2 | 3 | 4 | 5 }[];
  industries?: string[];
  preferredLocations?: string[];
  /** For each field that was filled, the words in the resume that produced it. */
  evidence: Partial<Record<ResumeField, string>>;
}

const MAX_SKILLS = 14;
const CONTACT_LINE = /@|\bhttps?:\/\/|linkedin\.com|github\.com|\+\d{1,3}[\s-]?\d{4,}|\b\d{10}\b/i;
const SECTION_HEADING = /^(summary|profile|objective|experience|work experience|professional experience|education|skills|technical skills|projects|certifications|achievements|contact|about|employment)\b/i;
const TITLE_WORDS = /\b(engineer|developer|manager|director|architect|analyst|designer|consultant|specialist|lead|head|scientist|administrator|officer|president|founder|owner|strategist|marketer|recruiter|accountant|auditor|advisor|coach|producer|editor|writer)\b/i;

/** Cities Wonder can match against postings. Anything else is better typed by the candidate than guessed. */
const KNOWN_LOCATIONS = [
  "Bengaluru", "Bangalore", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi", "New Delhi", "Gurugram", "Gurgaon", "Noida", "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Indore", "Chandigarh",
  "London", "Berlin", "Amsterdam", "Dublin", "Singapore", "Dubai", "Sydney", "Melbourne", "Toronto", "Vancouver", "New York", "San Francisco", "Seattle", "Austin", "Boston", "Chicago",
];

const INDUSTRY_HINTS: [string, RegExp][] = [
  ["Fintech", /\b(fintech|payments?|banking|lending|neobank|wallet|insurtech|trading|brokerage|wealth|crypto|blockchain|remittance|upi)\b/i],
  ["E-commerce", /\b(e-?commerce|marketplace|retail|d2c|quick commerce|grocery|storefront)\b/i],
  ["Healthcare", /\b(health(care|tech)?|medical|clinical|pharma|biotech|telehealth|hospital)\b/i],
  ["Education", /\b(ed-?tech|education|learning platform|university|tutoring|upskilling)\b/i],
  ["Gaming", /\b(gaming|esports|fantasy sports)\b/i],
  ["Media", /\b(media|streaming|entertainment|publishing|newsroom|creator economy)\b/i],
  ["Mobility", /\b(mobility|ride-?hailing|logistics|last-?mile|transport|automotive|fleet)\b/i],
  ["Travel", /\b(travel|hospitality|hotels?|airline|booking)\b/i],
  ["Telecom", /\b(telecom|telco|5g|carrier)\b/i],
  ["Consumer", /\b(consumer app|social network|community|dating|lifestyle|food delivery|restaurant)\b/i],
  ["Technology", /\b(saas|software|developer tools?|infrastructure|cloud|platform|api|machine learning|cybersecurity|enterprise)\b/i],
];

export function parseResume(text: string): ResumeDraft {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const head = lines.slice(0, 12);
  const draft: ResumeDraft = { evidence: {} };

  const name = findName(head);
  if (name) {
    draft.name = name.value;
    draft.evidence.name = name.from;
  }

  const headline = findHeadline(head, name?.from);
  if (headline) {
    draft.headline = headline.value;
    draft.evidence.headline = headline.from;
  }

  const years = findYears(text);
  if (years) {
    draft.yearsExperience = years.value;
    draft.evidence.yearsExperience = years.from;
  }

  // Seniority reads the titles someone has actually held, not every mention of a rank in the document:
  // "Reported to the director of product." is not a directorship.
  const titleLine = [headline?.value, ...lines.filter(looksLikeTitleLine).slice(0, 4)].filter(Boolean).join(" · ");
  if (titleLine) {
    draft.seniority = inferSeniority(titleLine);
    draft.evidence.seniority = titleLine.slice(0, 160);
  }

  const skills = rankSkills(text);
  if (skills.length) {
    draft.skills = skills;
    draft.evidence.skills = `${skills.length} of the skills Wonder matches against postings appear in your resume`;
  }

  const industries = findIndustries(text);
  if (industries.length) {
    draft.industries = industries;
    draft.evidence.industries = industries.join(", ");
  }

  const locations = findLocations(head.join(" "));
  if (locations.length) {
    draft.preferredLocations = locations;
    draft.evidence.preferredLocations = locations.join(", ");
  }

  return draft;
}

/**
 * A resume's title lines lead with the title and are labels, not sentences — "Senior Product Manager,
 * PayCircle — 2021 - Present". A bullet, or a sentence that happens to name a rank partway through,
 * is prose about someone else's job.
 */
function looksLikeTitleLine(line: string): boolean {
  if (/^[-–•*·]/.test(line) || line.endsWith(".")) return false;
  const words = line.split(" ");
  if (words.length > 12) return false;
  return TITLE_WORDS.test(words.slice(0, 4).join(" "));
}

function findName(head: string[]): { value: string; from: string } | undefined {
  for (const line of head) {
    if (CONTACT_LINE.test(line) || SECTION_HEADING.test(line)) continue;
    const words = line.split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    // A name is words of letters, usually capitalised, and doesn't read like a job title.
    if (TITLE_WORDS.test(line)) continue;
    if (!words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) || /^[A-Z.]{1,3}$/.test(w))) continue;
    return { value: line, from: line };
  }
  return undefined;
}

function findHeadline(head: string[], nameLine?: string): { value: string; from: string } | undefined {
  for (const line of head) {
    if (line === nameLine || CONTACT_LINE.test(line) || SECTION_HEADING.test(line)) continue;
    if (!TITLE_WORDS.test(line)) continue;
    if (line.length > 110) continue;
    return { value: line, from: line };
  }
  return undefined;
}

function findYears(text: string): { value: number; from: string } | undefined {
  const stated = text.match(/(\d{1,2})(?:\s*\+)?\s*(?:\+\s*)?years?(?:\s+of)?\s+(?:progressive\s+|relevant\s+|professional\s+|overall\s+)?experience/i);
  if (stated) {
    const n = Number(stated[1]);
    if (n >= 1 && n <= 50) return { value: n, from: stated[0] };
  }
  // Otherwise: this year minus the earliest year that appears in a date range, which is where a career
  // usually starts. Years on their own (a degree, a certificate) are ignored — too easy to misread.
  const ranges = [...text.matchAll(/\b(19[89]\d|20[0-4]\d)\s*[-–—]\s*(present|current|now|19[89]\d|20[0-4]\d)\b/gi)];
  if (!ranges.length) return undefined;
  const earliest = Math.min(...ranges.map((r) => Number(r[1])));
  const value = new Date().getFullYear() - earliest;
  if (value < 1 || value > 50) return undefined;
  return { value, from: `earliest role starts ${earliest}` };
}

/**
 * A skill named once in a bullet is weaker evidence than one that runs through the whole resume, so
 * strength follows how often it appears. The candidate can change any of it before it is saved.
 */
function rankSkills(text: string): { name: string; level: 1 | 2 | 3 | 4 | 5 }[] {
  const found = extractSkills(text, SKILL_LEXICON.length);
  const counted = found.map((name) => {
    const re = new RegExp(`(^|[^a-z0-9+#.])${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![a-z0-9+#])`, "gi");
    return { name, hits: (text.match(re) ?? []).length };
  });
  return counted
    .sort((a, b) => b.hits - a.hits)
    .slice(0, MAX_SKILLS)
    .map(({ name, hits }) => ({ name, level: (hits >= 5 ? 5 : hits >= 3 ? 4 : 3) as 1 | 2 | 3 | 4 | 5 }));
}

function findIndustries(text: string): string[] {
  const scored = INDUSTRY_HINTS.map(([name, re]) => ({ name, hits: (text.match(new RegExp(re.source, "gi")) ?? []).length })).filter((x) => x.hits > 0);
  return scored
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((x) => x.name)
    .filter((x) => INDUSTRIES.includes(x));
}

function findLocations(head: string): string[] {
  const out: string[] = [];
  for (const city of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${city}\\b`, "i").test(head) && !out.some((x) => x.toLowerCase() === city.toLowerCase())) out.push(city);
    if (out.length >= 2) break;
  }
  if (/\bremote\b/i.test(head)) out.push("Remote");
  return out;
}
