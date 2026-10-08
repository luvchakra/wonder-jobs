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
 * - It learns progressively from both sides: what the candidate keeps choosing (saving, applying), what
 *   they keep turning down (by reason, title words, employer) and where they keep searching. Each pattern
 *   needs repeated evidence, and its weight grows with that evidence.
 */
import type { CanonicalJob, Job } from "@/domain/jobs/types";
import type { CareerDNA } from "@/domain/career/types";
import { queryTerms, SENIORITY_WORDS } from "@/services/jobs/normalize";

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
  /** Older records have neither; title words and the employer are learned only once they're recorded. */
  title?: string;
  company?: string;
}

/**
 * A job the candidate showed interest in: saved it, or applied. The positive half of the loop — what they
 * keep choosing is learned the same way as what they keep turning down, with the same threshold.
 */
export interface InteractionRecord {
  jobId: string;
  at: string;
  kind: "saved" | "applied";
  industry: string;
  workMode: CanonicalJob["workMode"];
  title: string;
  company: string;
}

/** Places the candidate typed into a search themselves (never the profile's defaults). */
export interface SearchRecord {
  at: string;
  locations: string[];
}

export type LearnedSignalKind =
  | "avoid_industry"
  | "avoid_work_mode"
  | "prefer_lower_seniority"
  | "prefer_higher_seniority"
  | "avoid_title_term"
  | "avoid_company"
  | "prefer_industry"
  | "prefer_work_mode"
  | "prefer_title_term"
  | "prefer_location";

/** Kinds that rank matching roles higher; every other kind ranks them lower. */
export const PREFER_KINDS: ReadonlySet<LearnedSignalKind> = new Set(["prefer_industry", "prefer_work_mode", "prefer_title_term", "prefer_location"]);

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
export function computeLearnedSignals(
  records: RejectionRecord[],
  dismissed: ReadonlySet<string> = new Set(),
  more: { interactions?: InteractionRecord[]; searches?: SearchRecord[]; dna?: Pick<CareerDNA, "industries" | "workModes" | "preferredLocations">; confirmed?: ReadonlySet<string> } = {},
): LearnedSignal[] {
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
  const emit = (kind: LearnedSignalKind, value: string | undefined, evidenceRecords: { at: string }[], evidenceText: string, threshold = EVIDENCE_THRESHOLD) => {
    if (evidenceRecords.length < threshold) return;
    const id = signalId(kind, value);
    if (dismissed.has(id)) return;
    const lastObserved = evidenceRecords.reduce((max, r) => (r.at > max ? r.at : max), evidenceRecords[0].at);
    out.push({ id, kind, value, signalCount: evidenceRecords.length, confidence: confidenceFor(evidenceRecords.length), lastObserved, evidence: evidenceText, status: more.confirmed?.has(id) ? "confirmed" : "suggested" });
  };

  const interactions = more.interactions ?? [];
  const liked = groupBy(interactions, (r) => r.industry);
  const likedModes = groupBy(interactions, (r) => r.workMode);
  // A pattern the candidate both keeps choosing and keeps turning down counts the way they lean more.
  for (const [industry, list] of byIndustry) if ((liked.get(industry)?.length ?? 0) < list.length) emit("avoid_industry", industry, list, `Marked ${list.length} ${industry} roles "not for me — wrong industry"`);
  for (const [mode, list] of byWorkMode) if ((likedModes.get(mode)?.length ?? 0) < list.length) emit("avoid_work_mode", mode, list, `Marked ${list.length} ${mode} roles "not for me — wrong work mode"`);
  emit("prefer_lower_seniority", undefined, tooSenior, `Marked ${tooSenior.length} roles "not for me — too senior"`);
  emit("prefer_higher_seniority", undefined, tooJunior, `Marked ${tooJunior.length} roles "not for me — too junior"`);

  // What they keep choosing: industries and work modes not already in their preferences, and title words.
  const has = (list: string[] | undefined, v: string) => (list ?? []).some((x) => x.toLowerCase() === v.toLowerCase());
  for (const [industry, list] of liked) if (industry && !has(more.dna?.industries, industry) && (byIndustry.get(industry)?.length ?? 0) <= list.length) emit("prefer_industry", industry, list, `Saved or applied to ${list.length} ${industry} roles`);
  for (const [mode, list] of likedModes) if (mode && !has(more.dna?.workModes, mode) && (byWorkMode.get(mode)?.length ?? 0) <= list.length) emit("prefer_work_mode", mode, list, `Saved or applied to ${list.length} ${mode} roles`);
  const likedTerms = termIndex(interactions);
  for (const [term, list] of top(likedTerms)) emit("prefer_title_term", term, list, `“${term}” is in the title of ${list.length} roles you saved or applied to`);

  // What they keep turning down without a more specific reason: title words and employers.
  const loose = records.filter((r) => !r.reason || r.reason === "not_interested" || r.reason === "skills_mismatch" || r.reason === "other");
  const avoidTerms = [...termIndex(loose)].filter(([t]) => !likedTerms.has(t));
  for (const [term, list] of top(new Map(avoidTerms))) emit("avoid_title_term", term, list, `Marked ${list.length} roles with “${term}” in the title "not for me"`);
  const likedCompanies = new Set(interactions.map((r) => r.company.toLowerCase()));
  for (const [company, list] of groupBy(records, (r) => r.company ?? "")) if (company && !likedCompanies.has(company.toLowerCase())) emit("avoid_company", company, list, `Marked ${list.length} roles at ${company} "not for me"`, 2);

  // Places they keep typing into a search, beyond the ones in their preferences.
  const places = new Map<string, SearchRecord[]>();
  for (const r of more.searches ?? []) for (const l of new Set(r.locations.map((x) => x.trim()).filter(Boolean))) places.set(l, [...(places.get(l) ?? []), r]);
  for (const [place, list] of places) if (!has(more.dna?.preferredLocations, place)) emit("prefer_location", place, list, `Searched in ${place} ${list.length} times`);

  return out.sort((a, b) => b.signalCount - a.signalCount);
}

function groupBy<T>(list: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of list) {
    const k = key(r);
    if (k) m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

/** Words that say nothing about the kind of work. */
const PLAIN_TITLE_WORDS = new Set(["remote", "hybrid", "onsite", "job", "role", "position", "opening", "team", "full", "time", "part", "contract", "permanent", "temporary", "india", "us", "uk", "global", "ii", "iii", "iv", "sr", "jr"]);

/** Title word → the records whose title has it, each record counted once. */
function termIndex<T extends { title?: string; at: string }>(records: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of records) for (const t of queryTerms(r.title ?? "", 12)) if (t.length > 2 && !SENIORITY_WORDS.has(t) && !PLAIN_TITLE_WORDS.has(t) && !/^\d+$/.test(t)) m.set(t, [...(m.get(t) ?? []), r]);
  return m;
}

/** The five best-evidenced title words, so a handful of patterns are shown and acted on, not dozens. */
function top<T>(m: Map<string, T[]>): [string, T[]][] {
  return [...m].filter(([, l]) => l.length >= EVIDENCE_THRESHOLD).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
}

/** Only "suggested"/"confirmed" signals are active; "dismissed" ones the caller has already filtered out. */
export interface LearnedRankingEffect {
  points: number;
  note?: string;
}

const SENIORITY_RANK: Record<CareerDNA["seniority"], number> = { junior: 0, mid: 1, senior: 2, lead: 3, director: 4 };

const AVOID_NOTE = "Similar to roles you've marked not for me";
/** Ranking points per kind: lower for "avoid", higher for "prefer". Prefer points grow with evidence. */
const PENALTY: Partial<Record<LearnedSignalKind, number>> = { avoid_industry: 10, avoid_work_mode: 8, prefer_lower_seniority: 8, prefer_higher_seniority: 8, avoid_title_term: 6, avoid_company: 12 };
const BOOST: Partial<Record<LearnedSignalKind, number>> = { prefer_industry: 4, prefer_work_mode: 3, prefer_title_term: 5, prefer_location: 4 };
const MAX_BOOST = 8;
const WEIGHT: Record<LearnedSignal["confidence"], number> = { low: 0.6, medium: 0.8, high: 1 };

/**
 * The bounded ranking nudge a set of active learned signals applies to one job (positive points rank it
 * lower). Deliberately small and capped — the strongest "avoid" pattern only (never stacked), and "prefer"
 * patterns adding up to at most 8, weighted by how much evidence each has (or full weight once confirmed) —
 * so learning moves a job up or down the list, never hides it or overrides an otherwise-strong match.
 */
export function learnedRankingEffect(job: Pick<CanonicalJob | Job, "industry" | "workMode" | "seniority"> & Partial<Pick<CanonicalJob, "title" | "company" | "location">>, dnaSeniority: CareerDNA["seniority"], signals: LearnedSignal[]): LearnedRankingEffect {
  const active = signals.filter((s) => s.status !== "dismissed");
  const delta = SENIORITY_RANK[job.seniority] - SENIORITY_RANK[dnaSeniority];
  const titleTerms = new Set(queryTerms(job.title ?? "", 20));
  const eq = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const applies = (s: LearnedSignal): boolean => {
    switch (s.kind) {
      case "avoid_industry":
      case "prefer_industry":
        return eq(job.industry, s.value);
      case "avoid_work_mode":
      case "prefer_work_mode":
        return job.workMode === s.value;
      case "prefer_lower_seniority":
        return delta > 0;
      case "prefer_higher_seniority":
        return delta < 0;
      case "avoid_title_term":
      case "prefer_title_term":
        return !!s.value && titleTerms.has(s.value);
      case "avoid_company":
        return eq(job.company, s.value);
      case "prefer_location":
        return !!s.value && !!job.location && job.location.toLowerCase().includes(s.value.toLowerCase());
    }
  };
  const hits = active.filter(applies);
  const penalty = Math.max(0, ...hits.map((s) => PENALTY[s.kind] ?? 0));
  const boostHits = hits.filter((s) => BOOST[s.kind]);
  // Per kind, only the best-evidenced pattern counts — two title words of one role are one preference.
  const byKind = new Map<LearnedSignalKind, number>();
  for (const s of boostHits) byKind.set(s.kind, Math.max(byKind.get(s.kind) ?? 0, (BOOST[s.kind] ?? 0) * (s.status === "confirmed" ? 1 : WEIGHT[s.confidence])));
  const boost = Math.min(MAX_BOOST, Math.round([...byKind.values()].reduce((n, v) => n + v, 0)));
  if (!penalty && !boost) return { points: 0 };
  const likeNote = boostHits.some((s) => s.kind !== "prefer_location") ? "Like roles you've saved or applied to" : "Where you often search";
  return { points: penalty - boost, note: penalty >= boost ? AVOID_NOTE : likeNote };
}
