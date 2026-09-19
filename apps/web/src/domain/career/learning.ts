/**
 * The candidate learning loop for "Not for me" (spec: "Make 'Not for me' actually influence future
 * ranking/search, or remove any claim that it does").
 *
 * Before this module, rejecting a job did nothing but hide it from view — the app told the candidate
 * "Wonder will show fewer roles like this" while never reading `rejected` anywhere outside the jobs
 * store's own filters. That was a false claim, not a stretch goal. This closes it honestly:
 *
 * - One rejection changes nothing. A single data point is noise, not a preference (this is the
 *   over-learning guard the spec calls for: "a single rejection must not cause a major change").
 * - Once the *same* reason repeats enough times, a signal appears and quietly nudges ranking — a small,
 *   bounded score adjustment, never an outright exclusion, and never a silent rewrite of Career DNA.
 * - The candidate can see every active signal, confirm it (which is otherwise a no-op — status alone
 *   already affects ranking; confirming is the record that they agree) or dismiss it, and dismissing
 *   removes its effect and stops it resurfacing.
 */
import type { CanonicalJob, Job } from "@/domain/jobs/types";
import type { CareerDNA } from "@/domain/career/types";

export const REJECTION_REASONS = [
  { value: "too_junior", label: "Too junior" },
  { value: "too_senior", label: "Too senior" },
  { value: "wrong_industry", label: "Wrong industry" },
  { value: "wrong_location", label: "Wrong location" },
  { value: "wrong_work_mode", label: "Wrong work mode" },
  { value: "compensation", label: "Compensation" },
  { value: "skills_mismatch", label: "Skills mismatch" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export interface RejectionRecord {
  jobId: string;
  at: string;
  reason?: RejectionReason;
  /** Captured from the job at the moment of rejection, so a signal survives the job leaving the catalog. */
  industry: string;
  workMode: CanonicalJob["workMode"];
}

export type LearnedSignalKind = "avoid_industry" | "avoid_work_mode" | "prefer_lower_seniority" | "prefer_higher_seniority";

export interface LearnedSignal {
  /** Stable and derived from kind+value, so recomputing never duplicates or reorders a signal in view. */
  id: string;
  kind: LearnedSignalKind;
  /** The industry or work mode name, for the two kinds that need one. */
  value?: string;
  signalCount: number;
  confidence: "low" | "medium" | "high";
  lastObserved: string;
  evidence: string;
  /** "suggested" and "confirmed" both affect ranking; "dismissed" never does, and is never resurfaced. */
  status: "suggested" | "confirmed" | "dismissed";
}

/** Below this many same-reason rejections, nothing changes — noise, not a preference. */
const EVIDENCE_THRESHOLD = 3;
const CONFIDENCE_AT = { low: EVIDENCE_THRESHOLD, medium: 5, high: 8 } as const;

function confidenceFor(count: number): LearnedSignal["confidence"] {
  return count >= CONFIDENCE_AT.high ? "high" : count >= CONFIDENCE_AT.medium ? "medium" : "low";
}

function signalId(kind: LearnedSignalKind, value?: string): string {
  return value ? `${kind}:${value.toLowerCase()}` : kind;
}

/**
 * Recomputes every learned signal from the full rejection history. Pure and deterministic — same
 * history in, same signals out — so it's safe to call after every reject/unreject rather than
 * maintaining incremental counters that could drift from the underlying data.
 *
 * `dismissed` carries forward ids the candidate has already dismissed, so a pattern they rejected once
 * doesn't silently reappear just because the count still clears the threshold.
 */
export function computeLearnedSignals(records: RejectionRecord[], dismissed: ReadonlySet<string> = new Set()): LearnedSignal[] {
  const byIndustry = new Map<string, RejectionRecord[]>();
  const byWorkMode = new Map<string, RejectionRecord[]>();
  const tooJunior: RejectionRecord[] = [];
  const tooSenior: RejectionRecord[] = [];

  for (const r of records) {
    if (r.reason === "wrong_industry" && r.industry) {
      const list = byIndustry.get(r.industry) ?? [];
      list.push(r);
      byIndustry.set(r.industry, list);
    } else if (r.reason === "wrong_work_mode" && r.workMode) {
      const list = byWorkMode.get(r.workMode) ?? [];
      list.push(r);
      byWorkMode.set(r.workMode, list);
    } else if (r.reason === "too_junior") tooJunior.push(r);
    else if (r.reason === "too_senior") tooSenior.push(r);
  }

  const out: LearnedSignal[] = [];
  const emit = (kind: LearnedSignalKind, value: string | undefined, evidenceRecords: RejectionRecord[], evidenceText: string) => {
    if (evidenceRecords.length < EVIDENCE_THRESHOLD) return;
    const id = signalId(kind, value);
    if (dismissed.has(id)) return;
    const lastObserved = evidenceRecords.reduce((max, r) => (r.at > max ? r.at : max), evidenceRecords[0].at);
    out.push({ id, kind, value, signalCount: evidenceRecords.length, confidence: confidenceFor(evidenceRecords.length), lastObserved, evidence: evidenceText, status: "suggested" });
  };

  for (const [industry, list] of byIndustry) emit("avoid_industry", industry, list, `Marked ${list.length} ${industry} roles "not for me — wrong industry"`);
  for (const [mode, list] of byWorkMode) emit("avoid_work_mode", mode, list, `Marked ${list.length} ${mode} roles "not for me — wrong work mode"`);
  emit("prefer_lower_seniority", undefined, tooSenior, `Marked ${tooSenior.length} roles "not for me — too senior"`);
  emit("prefer_higher_seniority", undefined, tooJunior, `Marked ${tooJunior.length} roles "not for me — too junior"`);

  return out.sort((a, b) => b.signalCount - a.signalCount);
}

/** Only "suggested"/"confirmed" signals are active; "dismissed" ones the caller has already filtered out. */
export interface LearnedRankingEffect {
  points: number;
  note?: string;
}

const SENIORITY_RANK: Record<CareerDNA["seniority"], number> = { junior: 0, mid: 1, senior: 2, lead: 3, director: 4 };

/**
 * The bounded ranking nudge a set of active learned signals applies to one job. Deliberately small and
 * capped — the point is to move a job down the list, the way a human would deprioritize something
 * that keeps not panning out, never to hide it outright or override an otherwise-strong match.
 */
export function learnedRankingEffect(job: Pick<CanonicalJob | Job, "industry" | "workMode" | "seniority">, dnaSeniority: CareerDNA["seniority"], signals: LearnedSignal[]): LearnedRankingEffect {
  const active = signals.filter((s) => s.status !== "dismissed");
  for (const s of active) {
    if (s.kind === "avoid_industry" && s.value && job.industry.toLowerCase() === s.value.toLowerCase()) {
      return { points: 10, note: "Similar to roles you've marked not for me" };
    }
    if (s.kind === "avoid_work_mode" && s.value && job.workMode === s.value) {
      return { points: 8, note: "Similar to roles you've marked not for me" };
    }
  }
  const delta = SENIORITY_RANK[job.seniority] - SENIORITY_RANK[dnaSeniority];
  if (delta > 0 && active.some((s) => s.kind === "prefer_lower_seniority")) return { points: 8, note: "Similar to roles you've marked not for me" };
  if (delta < 0 && active.some((s) => s.kind === "prefer_higher_seniority")) return { points: 8, note: "Similar to roles you've marked not for me" };
  return { points: 0 };
}
