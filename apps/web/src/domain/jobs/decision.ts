import type { Application } from "@/domain/applications/types";
import type { AlignmentReason, CanonicalJob, JobMatch, JobQuality } from "./types";

/**
 * "Help me decide where to spend my time" (outcome spec §8–9). Turns a job's real match reasons and
 * quality signals into three short lists for the job card — why Wonder surfaced it, what to weigh,
 * and what Wonder suggests next. Every line is a direct reading of a computed score or an observed
 * signal (`services/jobs/matching.ts`); nothing here invents a fact about the job or the candidate.
 */
export interface JobDecision {
  why: string[];
  consider: string[];
  next: { label: string; kind: "prepare" | "continue_pack" | "review_pack" | "track" | "look" | "skip" };
}


/** Strong-alignment phrasing per dimension, or null when the score doesn't support saying it. */
function strength(r: AlignmentReason, job: CanonicalJob): string | null {
  switch (r.dimension) {
    case "skills":
      return r.score >= 0.75 ? "Strong overlap with your skills" : null;
    case "seniority":
      return r.score === 1 ? "Seniority aligns" : r.score >= 0.8 ? "A step up — a growth move" : null;
    case "industry":
      return r.score === 1 ? `${job.industry} is one of your target industries` : null;
    case "career_goal":
      return r.score >= 0.85 ? "Matches your career goal" : null;
    case "location":
      return r.score === 1 ? "Location works for you" : null;
    case "compensation":
      return r.score >= 0.85 && job.salaryMax != null ? "Pay meets your minimum" : null;
  }
}

/** Something to weigh, per dimension, or null when the score doesn't support saying it. */
function concern(r: AlignmentReason, job: CanonicalJob): string | null {
  switch (r.dimension) {
    case "skills":
      return r.score < 0.55 ? "Few of your skills appear in the posting" : null;
    case "seniority":
      return r.score <= 0.35 && r.score > 0.3 ? "Two or more levels above your current role" : r.score <= 0.3 ? "Below your current level" : r.score < 0.8 ? "One level below your current role" : null;
    case "industry":
      return r.score < 1 ? `${job.industry} is outside your target industries` : null;
    case "career_goal":
      return r.score < 0.6 ? "Only adjacent to your career goal" : null;
    case "location":
      return r.score <= 0.55 ? (job.workMode === "remote" ? "Remote, but hiring is restricted to another region" : "Outside your preferred locations") : null;
    case "compensation":
      return job.salaryMax == null ? "Compensation isn't disclosed" : r.score < 0.85 ? "Pay may be below your minimum" : null;
  }
}

const QUALITY_CONCERN: Partial<Record<string, (value: string) => string>> = {
  repost: (v) => `${v} — may be hard to fill`,
  employer_site: () => "Not found on the employer's own careers site",
  freshness: (v) => `${v} — may be less active`,
  apply_path: () => "How to apply is unclear",
};

export function describeDecision(job: CanonicalJob, match: JobMatch | undefined, quality: JobQuality | undefined, application?: Application): JobDecision {
  const why: string[] = [];
  const consider: string[] = [];
  if (match) {
    for (const r of [...match.reasons].sort((a, b) => b.score - a.score)) {
      const s = strength(r, job);
      if (s) why.push(s);
    }
    for (const r of [...match.reasons].sort((a, b) => a.score - b.score)) {
      const c = concern(r, job);
      if (c) consider.push(c);
    }
  }
  for (const sig of quality?.signals ?? []) {
    if (sig.sentiment !== "caution") continue;
    const f = QUALITY_CONCERN[sig.key];
    if (f) consider.push(f(sig.value));
  }

  let next: JobDecision["next"];
  if (application && application.status === "ready_for_review") next = { label: "Review your application pack", kind: "review_pack" };
  else if (application && (application.status === "saved" || application.status === "preparing")) next = { label: "Finish your application pack", kind: "continue_pack" };
  else if (application) next = { label: "Follow it in Applications", kind: "track" };
  else if (match?.fit === "strong") next = { label: "Prepare an application", kind: "prepare" };
  else if (match?.fit === "worth_considering") next = { label: "Take a closer look", kind: "look" };
  else if (match?.fit === "stretch") next = { label: "A stretch — look closer before preparing", kind: "look" };
  else if (match) next = { label: "Probably not the best use of your time", kind: "skip" };
  else next = { label: "Take a closer look", kind: "look" };

  return { why: why.slice(0, 4), consider: consider.slice(0, 3), next };
}
