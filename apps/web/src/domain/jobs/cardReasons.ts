import type { CanonicalJob, JobMatch } from "./types";

/** A reason counts on a card only when that part of the match is strong. */
const STRONG = 0.8;

/**
 * Up to three short lines for a job card ("Matches 8 of your skills", "Remote friendly"), each read from
 * the match Wonder computed for this job — only the parts that scored well, strongest first. Nothing is
 * said that the match itself doesn't show; a weak match gets no lines.
 */
export function cardReasons(job: Pick<CanonicalJob, "workMode" | "salaryMax">, match: Pick<JobMatch, "reasons"> | undefined, max = 3): string[] {
  if (!match) return [];
  const lines: { text: string; score: number }[] = [];
  for (const r of match.reasons) {
    if (r.score < STRONG) continue;
    let text: string | null = null;
    switch (r.dimension) {
      case "skills": {
        const n = Number(/^(\d+) of your skills/.exec(r.summary)?.[1] ?? 0);
        text = n > 0 ? `Matches ${n} of your skills` : null;
        break;
      }
      case "seniority":
        text = r.score === 1 ? "Your level" : "One step up";
        break;
      case "industry":
        text = "In your target industry";
        break;
      case "career_goal":
        text = r.label === "Search match" ? "Title matches your search" : "Role in your field";
        break;
      case "location":
        text = job.workMode === "remote" ? "Remote friendly" : "In your preferred location";
        break;
      case "compensation":
        // Undisclosed pay scores near-neutral, never as a reason.
        text = job.salaryMax != null && r.score >= 0.85 ? "Pay meets your minimum" : null;
        break;
    }
    if (text) lines.push({ text, score: r.score });
  }
  return lines
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((l) => l.text);
}
