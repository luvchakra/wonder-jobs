/**
 * How well a posting answers what the candidate typed — the search half of ranking (the profile half is
 * `computeMatch`). Field-weighted like BM25F: a word in the title counts most, then the posting's skills and
 * tags, its requirements, the company and place, and last its description. Every word is matched whole, as
 * any form of itself ("psychology" ↔ "Psychologist", `wordFamily`) or a known spelling (`TERM_SYNONYMS`),
 * and a one-letter slip in a longer word ("pyschologist") still finds the title. Level words ("senior") and
 * industry words weigh less: titles name them inconsistently, and the profile scores them separately.
 */
import type { CanonicalJob, Job } from "@/domain/jobs/types";
import { hasTermOrSynonym, INDUSTRY_WORDS, queryTerms, SENIORITY_WORDS, wordsOf } from "./normalize";

type Searchable = Pick<Job | CanonicalJob, "title" | "company" | "location" | "skills" | "tags" | "requirements" | "description">;

const FIELDS: { key: "title" | "head" | "requirements" | "where" | "description"; weight: number }[] = [
  { key: "title", weight: 1 },
  { key: "head", weight: 0.7 },
  { key: "requirements", weight: 0.5 },
  { key: "where", weight: 0.5 },
  { key: "description", weight: 0.3 },
];

export interface SearchTerm {
  word: string;
  weight: number;
  /** A word that names the role or field (not a level or industry). Every one must be found somewhere. */
  core: boolean;
}

/** The words of a typed search and how much each counts. */
export function searchTerms(query: string): SearchTerm[] {
  return queryTerms(query, 10).map((word) => {
    const qualifier = SENIORITY_WORDS.has(word) || INDUSTRY_WORDS.has(word);
    return { word, weight: SENIORITY_WORDS.has(word) ? 0.35 : INDUSTRY_WORDS.has(word) ? 0.5 : 1, core: !qualifier };
  });
}

/** Optimal-string-alignment distance, stopping early past `max`. */
function closeEnough(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return false;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** A typo in a longer word: one slip from 5 letters, two from 9, against whole words only (a prefix would make "product" find "Production"). */
function nearMiss(text: string, word: string): boolean {
  if (word.length < 5) return false;
  const max = word.length >= 9 ? 2 : 1;
  return wordsOf(text).some((w) => w.length >= 4 && closeEnough(w, word, max));
}

export interface Relevance {
  /** 0..1 — how much of the search the posting answers, and where. */
  score: number;
  /** Every role/field word was found somewhere in the posting. */
  complete: boolean;
  /** Every role/field word is in the title. */
  inTitle: boolean;
  matched: string[];
  missing: string[];
}

export function relevance(job: Searchable, query: string): Relevance {
  const terms = searchTerms(query);
  if (!terms.length) return { score: 1, complete: true, inTitle: true, matched: [], missing: [] };
  const text = {
    title: job.title,
    head: `${job.skills.join(" · ")} · ${job.tags.join(" · ")}`,
    requirements: job.requirements.join(" · "),
    where: `${job.company} · ${job.location}`,
    description: job.description ?? "",
  };
  let got = 0;
  let total = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  let coreInTitle = 0;
  const cores = terms.filter((t) => t.core).length;
  for (const t of terms) {
    total += t.weight;
    const field = FIELDS.find((f) => hasTermOrSynonym(text[f.key], t.word));
    // A slip of the keyboard counts in the title and skills, at a little less than the real word.
    const near = !field && (nearMiss(text.title, t.word) ? 0.85 : nearMiss(text.head, t.word) ? 0.55 : 0);
    const w = field ? field.weight : near || 0;
    if (w) {
      got += t.weight * w;
      matched.push(t.word);
      if (t.core && (field?.key === "title" || near === 0.85)) coreInTitle++;
    } else missing.push(t.word);
  }
  const complete = terms.every((t) => !t.core || matched.includes(t.word)) && (cores > 0 || matched.length > 0);
  const inTitle = cores > 0 ? coreInTitle === cores : matched.length > 0 && terms.every((t) => hasTermOrSynonym(text.title, t.word));
  // The words in the title in the order typed ("product manager", not "manager, product") is the best answer there is.
  const phrase = cores > 1 && inTitle && hasTermOrSynonym(text.title, terms.filter((t) => t.core).map((t) => t.word).join(" ")) ? 0.1 : 0;
  return { score: Math.min(1, got / total + phrase), complete, inTitle, matched, missing };
}

/** Whether the posting answers the search at all: every role/field word somewhere (level words alone: in the title). */
export function answersSearch(job: Searchable, query: string): boolean {
  return relevance(job, query).complete;
}
