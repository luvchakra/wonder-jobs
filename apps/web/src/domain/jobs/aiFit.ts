import type { CareerDNA } from "@/domain/career/types";
import type { CanonicalJob, JobMatch } from "./types";
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
