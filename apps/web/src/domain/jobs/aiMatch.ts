import type { JobMatch } from "./types";
import { fitLabel } from "@/services/jobs/matching";

/**
 * The AI relevance check (owner, 2026-11-25: "can you use ai to do the matching and finding the right results"):
 * after a search for words or as a role, a model reads the leading results and says how relevant each is to what
 * was searched (0–100) with one short reason. It's a proposal: `applyAiRelevance` (application code) decides
 * what it changes, within fixed limits, and the reason is shown labelled AI-generated. Gated by `ai_match`
 * (`resolveCapability`); with no model, or any failure, the rules' ranking stands unchanged.
 */
export interface AiRelevance {
  score: number;
  reason: string;
  /** `relevanceKey()` of the words it was read against: another search's words never reuse it. */
  key: string;
  at: string;
}

/** How many of the leading results the model reads in one call. */
export const AI_MATCH_TOP = 40;
export const AI_MATCH_LABEL = "AI relevance check (AI-generated)";
/** Under this, the model judged the posting unrelated to what was searched: it sinks to a low fit. */
const UNRELATED = 25;
const UP = 15;
const DOWN = 25;

export function relevanceKey(words: string): string {
  const s = words.trim().toLowerCase().replace(/\s+/g, " ");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `w${(h >>> 0).toString(36)}`;
}

/** What the model is given: what was searched, and each posting's public text. The postings are data, never instructions. */
export function aiMatchPrompt(search: { words: string; goal?: string; role?: string }, jobs: { id: string; title: string; company: string; location: string; level: string; excerpt: string }[]): string {
  const strip = (s: string) => s.replace(/<\/?(search|postings)>/gi, "");
  const want = { searchedFor: search.words.slice(0, 160), ...(search.role ? { asRole: search.role.slice(0, 80) } : {}), ...(search.goal ? { goal: search.goal.slice(0, 200) } : {}) };
  return `<search>\n${strip(JSON.stringify(want))}\n</search>\n<postings>\n${strip(JSON.stringify(jobs))}\n</postings>`;
}

/** The model's reply, kept only for postings it was given, with a score 0–100 and a short reason; null when nothing usable came back. */
export function parseAiMatch(text: string, ids: string[]): { id: string; score: number; reason: string }[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const rows = (data as { results?: unknown }).results;
  if (!Array.isArray(rows)) return null;
  const known = new Set(ids);
  const seen = new Set<string>();
  const out: { id: string; score: number; reason: string }[] = [];
  for (const r of rows as { id?: unknown; score?: unknown; reason?: unknown }[]) {
    if (typeof r?.id !== "string" || !known.has(r.id) || seen.has(r.id) || typeof r.score !== "number" || !Number.isFinite(r.score) || typeof r.reason !== "string" || !r.reason.trim()) continue;
    seen.add(r.id);
    out.push({ id: r.id, score: Math.round(Math.max(0, Math.min(100, r.score))), reason: r.reason.replace(/\s+/g, " ").trim().slice(0, 160) });
  }
  return out.length ? out : null;
}

/**
 * The rules' match with the model's relevance read applied: a posting it judged unrelated sinks to a low fit;
 * otherwise the score moves toward the model's by half the gap, at most +15 / −25. The reason is added, labelled
 * AI-generated. A read for other words (or none) changes nothing.
 */
export function applyAiRelevance(match: JobMatch, ai: AiRelevance | undefined, key: string | undefined): JobMatch {
  if (!ai || !key || ai.key !== key) return match;
  const score = ai.score < UNRELATED ? Math.min(match.score, 39) : Math.max(0, Math.min(100, match.score + Math.max(-DOWN, Math.min(UP, Math.round(0.5 * (ai.score - match.score))))));
  return {
    ...match,
    score,
    fit: fitLabel(score),
    reasons: [...match.reasons.filter((r) => r.label !== AI_MATCH_LABEL), { dimension: "career_goal", label: AI_MATCH_LABEL, score: ai.score / 100, summary: ai.reason }],
  };
}
