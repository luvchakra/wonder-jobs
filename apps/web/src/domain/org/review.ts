/**
 * Reviewing applicants as a team (owner, 2026-10-28), modelled on structured hiring in Greenhouse and Ashby: each
 * person on the hiring team leaves a scorecard — an overall recommendation and a note — and the application shows
 * them together. Notes are the team's own: never shown or sent to the applicant. The applicant's fit is computed
 * only from what they sent (their skills against the job's), never guessed.
 */
export type Recommendation = "strong_no" | "no" | "yes" | "strong_yes";

export const RECOMMENDATIONS: Recommendation[] = ["strong_no", "no", "yes", "strong_yes"];
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { strong_no: "Strong no", no: "No", yes: "Yes", strong_yes: "Strong yes" };

export interface ApplicationReview {
  id: string;
  applicationId: string;
  authorTenant: string;
  authorName: string;
  /** Absent for a note without a recommendation. */
  recommendation?: Recommendation;
  note: string;
  createdAt: string;
}

export const MAX_NOTE = 2000;

export function isRecommendation(v: unknown): v is Recommendation {
  return typeof v === "string" && (RECOMMENDATIONS as string[]).includes(v);
}

/** A review as a request gave it, cleaned; or what's wrong. A review is a recommendation, a note, or both. */
export function cleanReview(raw: { recommendation?: unknown; note?: unknown }): { recommendation?: Recommendation; note: string } | { problem: string } {
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, MAX_NOTE) : "";
  if (raw.recommendation != null && raw.recommendation !== "" && !isRecommendation(raw.recommendation)) return { problem: "Pick Strong no, No, Yes or Strong yes." };
  const recommendation = isRecommendation(raw.recommendation) ? raw.recommendation : undefined;
  if (!recommendation && !note) return { problem: "Add a recommendation or a note." };
  return { ...(recommendation ? { recommendation } : {}), note };
}

/**
 * The team's view of an applicant: each person's latest recommendation counts once (a changed mind replaces the old
 * one), tallied; notes all stay.
 */
export function summarizeReviews(reviews: ApplicationReview[]): { counts: Record<Recommendation, number>; total: number; leaning: "yes" | "no" | "split" | null } {
  const latest = new Map<string, Recommendation>();
  for (const r of [...reviews].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (r.recommendation) latest.set(r.authorTenant, r.recommendation);
  const counts: Record<Recommendation, number> = { strong_no: 0, no: 0, yes: 0, strong_yes: 0 };
  for (const r of latest.values()) counts[r]++;
  const total = latest.size;
  const yes = counts.yes + counts.strong_yes;
  const no = counts.no + counts.strong_no;
  return { counts, total, leaning: !total ? null : yes && no ? "split" : yes ? "yes" : "no" };
}

/** What the applicant shared from their Career Profile with an Easy Apply application. */
export interface ApplicantProfile {
  headline?: string;
  skills: string[];
  yearsExperience?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();

/**
 * The job's skills the applicant has, by name: an exact match, or one containing the other ("SQL" and "PostgreSQL SQL").
 * Null when either side lists no skills — there's nothing to compare, so no fit is shown.
 */
export function applicantFit(jobSkills: string[], applicant: ApplicantProfile | undefined): { matched: string[]; missing: string[] } | null {
  const want = [...new Set(jobSkills.map((s) => s.trim()).filter(Boolean))];
  const have = (applicant?.skills ?? []).map(norm).filter(Boolean);
  if (!want.length || !have.length) return null;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of want) {
    const n = norm(s);
    (have.some((h) => h === n || (n.length > 2 && h.includes(n)) || (h.length > 2 && n.includes(h))) ? matched : missing).push(s);
  }
  return { matched, missing };
}

/** The applicant's profile as a request gave it, trimmed to what's kept. */
export function cleanApplicantProfile(raw: unknown): ApplicantProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const skills = Array.isArray(r.skills) ? r.skills.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 40) : [];
  const headline = typeof r.headline === "string" ? r.headline.trim().slice(0, 160) : "";
  const years = typeof r.yearsExperience === "number" && Number.isFinite(r.yearsExperience) && r.yearsExperience >= 0 && r.yearsExperience <= 60 ? Math.round(r.yearsExperience) : undefined;
  if (!skills.length && !headline && years == null) return undefined;
  return { ...(headline ? { headline } : {}), skills, ...(years != null ? { yearsExperience: years } : {}) };
}
