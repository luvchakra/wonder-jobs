/**
 * Smart search: besides what the candidate asked for, the same search runs at once for a few broader
 * phrasings of it — "senior director identity access" also as "director identity access", "identity
 * access" and "identity" — so a place where nobody posts the exact title still turns up the field.
 *
 * AI may propose phrasings (e.g. "identity and access management" from the Career Profile); code keeps
 * only those built entirely from the candidate's own words (`checkedWiderQuery`), never a new role, and
 * the rules below fill the rest. At most three extra phrasings.
 */
import { INDUSTRY_WORDS, queryTerms, SENIORITY_WORDS } from "@/services/jobs/normalize";
import { checkedWiderQuery } from "./readiness";

export const MAX_VARIANTS = 3;

/** Words that only qualify a level ("senior director" → "director"). */
const MODIFIERS = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "associate", "assistant", "deputy", "executive", "chief", "global", "regional"]);
/** Words that name a level of role rather than a field. */
const LEVELS = new Set([...SENIORITY_WORDS, "sr", "jr", "manager", "officer", "avp", "associate", "assistant", "deputy", "executive", "global", "regional"]);

const keyOf = (q: string) => queryTerms(q, 20).sort().join(" ");

/** Broader phrasings of a query, broadest last: without level qualifiers, the field alone, the field's first word. */
export function ruleVariants(query: string): string[] {
  const t = queryTerms(query, 8);
  const noModifiers = t.filter((w) => !MODIFIERS.has(w));
  const field = t.filter((w) => !LEVELS.has(w) && !INDUSTRY_WORDS.has(w));
  const out = [noModifiers.join(" "), field.join(" "), field.length >= 2 ? field[0] : ""];
  return unique(out, query);
}

function unique(list: string[], query: string): string[] {
  const seen = new Set([keyOf(query)]);
  const out: string[] = [];
  for (const q of list) {
    const k = keyOf(q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim().replace(/\s+/g, " "));
  }
  return out;
}

/**
 * The phrasings to search alongside `query`: AI proposals that use only the candidate's own words come
 * first, then the rules', up to MAX_VARIANTS. `fromAi` says which ones AI picked, for the evidence.
 */
export function searchVariants(query: string, aiProposals: string[] | null | undefined, vocabulary: Set<string>): { variants: string[]; fromAi: string[] } {
  const ai = (aiProposals ?? []).map((p) => checkedWiderQuery(p, query, vocabulary)).filter((p): p is string => !!p);
  const variants = unique([...ai, ...ruleVariants(query)], query).slice(0, MAX_VARIANTS);
  const aiKeys = new Set(ai.map(keyOf));
  return { variants, fromAi: variants.filter((v) => aiKeys.has(keyOf(v))) };
}
