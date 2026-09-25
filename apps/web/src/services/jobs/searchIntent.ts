import { INDUSTRY_WORDS, SENIORITY_WORDS, queryTerms, stripSelfReference } from "./normalize";

/**
 * "Find Senior Director or VP IAM roles in Mumbai, Singapore or remote" → the search Wonder will
 * actually run. Deterministic and literal: every derived value is a piece of what the candidate
 * typed, shown back to them with the words it came from before anything runs. Nothing is inferred
 * that isn't in the text — no role, location or salary is ever filled from a default.
 */
export type WorkModeHint = "remote" | "hybrid" | "onsite";

export interface DerivedField {
  field: "query" | "locations" | "workModes" | "seniority" | "industries";
  label: string;
  value: string;
  /** The exact words in the request this came from. */
  from: string;
}

export interface SearchIntent {
  /** Terms sent to the job boards; empty when no role could be read — the caller must ask, not guess. */
  query: string;
  locations: string[];
  workModes: WorkModeHint[];
  seniority: string[];
  /** Mentioned industries. Career Profile scores industry fit; they don't narrow the board search. */
  industries: string[];
  derived: DerivedField[];
}

const LEAD_IN = /^\s*(?:please\s+)?(?:find(?:\s+me)?|search(?:\s+for)?|look(?:ing)?\s+for|show\s+me|get\s+me|i\s+want|i['’]?d\s+like|help\s+me\s+find)\s+/i;
const QUALIFIER_TAIL = /\s*[,;]?\s*\b(?:preferably|ideally|with|paying|that|which|where)\b.*$/i;
// "in IAM" names a field, "in Mumbai" names a place: a clause only counts as places when it
// names at least one we recognise (or a work mode). Unknown towns alongside a known one are kept.
const KNOWN_PLACES = /^(?:india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|new delhi|ncr|gurugram|gurgaon|noida|kolkata|ahmedabad|jaipur|kochi|indore|chandigarh|singapore|dubai|abu dhabi|uae|london|uk|united kingdom|europe|emea|apac|asia|berlin|amsterdam|paris|dublin|new york|nyc|san francisco|bay area|seattle|austin|boston|us|usa|united states|canada|toronto|sydney|melbourne|australia|tokyo|hong kong|anywhere|worldwide)$/i;
const MODE_WORDS: Record<string, WorkModeHint> = { remote: "remote", "remote-first": "remote", "work from home": "remote", wfh: "remote", hybrid: "hybrid", onsite: "onsite", "on-site": "onsite", "in-office": "onsite" };

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function deriveSearchIntent(raw: string): SearchIntent {
  const text = stripSelfReference(raw.trim().replace(LEAD_IN, ""));
  const derived: DerivedField[] = [];
  const locations: string[] = [];
  const workModes = new Set<WorkModeHint>();

  // Places: the last "in …" clause whose pieces name a real place or work mode.
  let rolePart = text.replace(QUALIFIER_TAIL, "");
  const clauses = [...rolePart.matchAll(/\b(?:in|based\s+in|near|around|across)\s+/gi)].reverse();
  for (const m of clauses) {
    const clause = rolePart.slice(m.index! + m[0].length);
    const pieces = clause.split(/\s*(?:,|\/|\bor\b|\band\b)\s*/i).map((p) => p.trim().replace(/[.!?]+$/, "")).filter(Boolean);
    if (!pieces.some((p) => KNOWN_PLACES.test(p) || MODE_WORDS[p.toLowerCase()])) continue;
    for (const piece of pieces) {
      // "in fintech, Bengaluru or remote": the industry word is a preference, not a place.
      if (INDUSTRY_WORDS.has(piece.toLowerCase())) continue;
      const mode = MODE_WORDS[piece.toLowerCase()];
      if (mode) workModes.add(mode);
      if (mode === "remote") locations.push("Remote");
      else if (!mode) locations.push(titleCase(piece.toLowerCase()));
    }
    derived.push({ field: "locations", label: "Where", value: locations.join(", "), from: rolePart.slice(m.index!).trim() });
    rolePart = rolePart.slice(0, m.index).trim();
    break;
  }
  // Work-mode words anywhere else in the request ("remote IAM roles").
  for (const [word, mode] of Object.entries(MODE_WORDS)) {
    if (new RegExp(`\\b${word.replace(/[-]/g, "[- ]")}\\b`, "i").test(text) && !workModes.has(mode)) {
      workModes.add(mode);
      if (mode === "remote" && !locations.includes("Remote")) locations.push("Remote");
    }
  }
  if (workModes.size) derived.push({ field: "workModes", label: "Work mode", value: [...workModes].map((m) => titleCase(m)).join(", "), from: [...workModes].join(", ") });

  const terms = queryTerms(rolePart);
  const seniority = terms.filter((t) => SENIORITY_WORDS.has(t));
  const industries = [...new Set(text.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => INDUSTRY_WORDS.has(w)))];
  const query = terms.filter((t) => !INDUSTRY_WORDS.has(t)).slice(0, 5).join(" ");
  if (query) derived.unshift({ field: "query", label: "Roles", value: query, from: rolePart.trim() });
  if (seniority.length) derived.push({ field: "seniority", label: "Seniority", value: seniority.map(titleCase).join(", "), from: seniority.join(" ") });
  if (industries.length) derived.push({ field: "industries", label: "Industry preference", value: industries.map(titleCase).join(", "), from: industries.join(" ") });

  return { query, locations, workModes: [...workModes], seniority, industries, derived };
}
