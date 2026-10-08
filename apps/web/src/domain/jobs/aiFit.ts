import type { CareerDNA } from "@/domain/career/types";
import type { CanonicalJob, JobMatch, JobQuality } from "./types";
import { fitLabel } from "@/services/jobs/matching";

/**
 * A model's read of how well a posting fits the candidate (0–100, one short reason), kept per job with the
 * profile it was read against. It adjusts the rule-based match — never replaces it: the rules' score moves
 * by at most +15 / −20, so their hard limits (location, level, relevance) still decide the band, and the
 * reason is shown as the AI's, so the candidate can see where the change came from.
 */
export interface AiFit {
  score: number;
  reason: string;
  /** profileKey() of the Career Profile it was read against — a changed profile drops it. */
  profile: string;
  at: string;
  /** Warning signs the model found in the posting, each with the posting's own words as proof. */
  flags?: AiFlag[];
}

/** The only warning signs a model may raise about a posting; the wording shown is the app's, not the model's. */
export const POSTING_FLAGS = {
  fee_to_apply: { text: "Asks for a fee or payment to apply", strong: true },
  financial_details: { text: "Asks for bank or ID details up front", strong: true },
  not_a_job: { text: "Reads like a course or an ad, not a job", strong: true },
  off_platform_contact: { text: "Asks you to apply by chat app or personal email", strong: false },
  commission_only: { text: "Pay is commission only", strong: false },
  vague_role: { text: "The duties are vague", strong: false },
} as const;
export type PostingFlag = keyof typeof POSTING_FLAGS;
export interface AiFlag {
  flag: PostingFlag;
  /** Verbatim words from the posting. */
  quote: string;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** A model's warning signs, kept only for a known flag whose quote is really in the posting text it read. */
export function checkedFlags(raw: { flag: string; quote: string }[] | undefined, postingText: string): AiFlag[] {
  const text = norm(postingText);
  const out: AiFlag[] = [];
  for (const r of raw ?? []) {
    const quote = r.quote.replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "");
    if (!(r.flag in POSTING_FLAGS) || quote.length < 4 || !text.includes(norm(quote)) || out.some((f) => f.flag === r.flag)) continue;
    out.push({ flag: r.flag as PostingFlag, quote: quote.slice(0, 160) });
  }
  return out.slice(0, 3);
}

export const AI_QUALITY_LABEL = "Posting read by AI";

/**
 * Adds the model's read of a posting to its quality signals: what it found, in the app's words with the
 * posting's own as proof. A strong sign (a fee, bank details, not a job) makes hiring confidence low;
 * nothing found adds a neutral line and never raises confidence.
 */
export function blendAiQuality(q: JobQuality, ai: AiFit | undefined): JobQuality {
  if (!ai?.flags) return q;
  const signals = q.signals.filter((s) => s.key !== "posting_content");
  if (!ai.flags.length) return { ...q, signals: [...signals, { key: "posting_content", label: AI_QUALITY_LABEL, value: "No warning signs found", sentiment: "neutral" }] };
  const value = ai.flags.map((f) => `${POSTING_FLAGS[f.flag].text}: “${f.quote}”`).join(" · ");
  const strong = ai.flags.some((f) => POSTING_FLAGS[f.flag].strong);
  return {
    ...q,
    confidence: strong ? "low" : q.confidence,
    summary: `${q.summary} AI found: ${ai.flags.map((f) => POSTING_FLAGS[f.flag].text.toLowerCase()).join("; ")}.`,
    signals: [...signals, { key: "posting_content", label: AI_QUALITY_LABEL, value, sentiment: "caution" }],
  };
}

const UP = 15;
const DOWN = 20;

/** Changes when what the fit depends on changes: the role wanted, the headline, level and skills. */
export function profileKey(dna: Pick<CareerDNA, "careerGoal" | "headline" | "seniority" | "skills">): string {
  const s = [dna.careerGoal, dna.headline, dna.seniority, dna.skills.map((k) => k.name).join(",")].join("|").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `p${(h >>> 0).toString(36)}`;
}

export function blendAiFit(match: JobMatch, ai: AiFit | undefined, profile: string): JobMatch {
  if (!ai || ai.profile !== profile) return match;
  const shift = Math.max(-DOWN, Math.min(UP, Math.round(0.4 * (ai.score - match.score))));
  const score = Math.max(0, Math.min(100, match.score + shift));
  return {
    ...match,
    score,
    fit: fitLabel(score),
    reasons: [...match.reasons.filter((r) => r.label !== AI_LABEL), { dimension: "career_goal", label: AI_LABEL, score: ai.score / 100, summary: ai.reason }],
  };
}

export const AI_LABEL = "AI read of the posting";

/** What the model is shown about a posting — public posting text only, trimmed. */
export function jobForAi(j: CanonicalJob) {
  return { id: j.id, title: j.title.slice(0, 120), company: j.company.slice(0, 80), location: j.location.slice(0, 80), level: j.seniority, excerpt: j.description.replace(/\s+/g, " ").slice(0, 700) };
}

/** What the model is shown about the candidate — their own profile facts, no contact details. */
export function profileForAi(dna: CareerDNA) {
  return { roleWanted: dna.careerGoal.slice(0, 160), headline: dna.headline.slice(0, 160), level: dna.seniority, years: dna.yearsExperience, skills: dna.skills.slice(0, 25).map((s) => s.name), industries: dna.industries.slice(0, 8), locations: dna.preferredLocations.slice(0, 6) };
}
