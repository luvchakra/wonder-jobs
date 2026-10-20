/**
 * How sure Skill Up is that a suggestion is worth learning (owner, 2026-10-20): a 0–100 score from the evidence
 * behind it, never a guess. Each part is shown with it, so the number can be checked:
 * - how widely it's asked — half the score, full once a quarter of the jobs that fit ask for it;
 * - how many of those are Strong matches — a quarter;
 * - how plainly they ask — a quarter: a skill tag or a named certification is plain, a passing mention in the text less so.
 * A broad skill ("Risk", "Leadership") counts for less; one of the candidate's own growth areas for a little more.
 */
export interface Evidence {
  jobs: number;
  strong: number;
  /** Jobs that ask for it plainly (a tag, or a certification by name). */
  plain: number;
  generic?: boolean;
  goal?: boolean;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  /** The parts, in words, for the score's explanation. */
  parts: string[];
}

/** A quarter of the jobs that fit asking for it is as wide as demand needs to be for full marks. */
const WIDE = 0.25;

export function confidence(e: Evidence, considered: number): Confidence {
  if (!e.jobs || !considered) return { score: 0, level: "low", parts: [] };
  const share = Math.min(1, e.jobs / considered / WIDE);
  const strong = e.strong / e.jobs;
  const plain = e.plain / e.jobs;
  let score = 100 * (0.5 * share + 0.25 * strong + 0.25 * plain);
  if (e.generic) score *= 0.6;
  if (e.goal) score += 10;
  const rounded = Math.max(1, Math.min(99, Math.round(score)));
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const parts = [`asked in ${pct(e.jobs / considered)} of the jobs that fit you`, `${pct(strong)} of them Strong matches`, `${pct(plain)} ask for it by name`];
  if (e.generic) parts.push("a broad skill, so it counts for less");
  if (e.goal) parts.push("one of your growth areas");
  return { score: rounded, level: rounded >= 70 ? "high" : rounded >= 40 ? "medium" : "low", parts };
}
