import { FIT_META, type AlignmentReason, type CanonicalJob, type JobMatch, type JobQuality } from "./types";

/**
 * Side-by-side comparison (outcome spec §13). Each row reads one real dimension for every job;
 * the observations name which job is closer on that dimension and never declare an overall winner —
 * the candidate decides.
 */
export interface CompareRow {
  key: string;
  label: string;
  values: string[];
}

export interface CompareResult {
  rows: CompareRow[];
  observations: string[];
}

const DIMENSIONS: { key: AlignmentReason["dimension"]; label: string; observe: string }[] = [
  { key: "career_goal", label: "Career fit", observe: "aligns more closely with your career goal" },
  { key: "seniority", label: "Seniority", observe: "aligns more closely with your target seniority" },
  { key: "skills", label: "Skills alignment", observe: "is a stronger match on your skills" },
  { key: "location", label: "Location", observe: "fits your location preferences better" },
  { key: "compensation", label: "Compensation", observe: "looks stronger on compensation" },
  { key: "industry", label: "Industry", observe: "is closer to your target industries" },
];

const strengthWord = (s: number) => (s >= 0.85 ? "Strong" : s >= 0.6 ? "Good" : "Weak");

function trajectory(r: AlignmentReason | undefined): string {
  if (!r) return "—";
  return r.score === 1 ? "Same level" : r.score >= 0.8 ? "One step up" : r.score > 0.35 ? "One step down" : r.score > 0.3 ? "Two+ levels up" : "Two+ levels down";
}

export function compareJobs(jobs: CanonicalJob[], matches: Record<string, JobMatch>, quality: Record<string, JobQuality>): CompareResult {
  const short = (j: CanonicalJob) => `${j.title} at ${j.company}`;
  const rows: CompareRow[] = [{ key: "fit", label: "Overall fit", values: jobs.map((j) => (matches[j.id] ? FIT_META[matches[j.id].fit].label : "Not compared yet")) }];
  const observations: string[] = [];

  for (const d of DIMENSIONS) {
    const reasons = jobs.map((j) => matches[j.id]?.reasons.find((r) => r.dimension === d.key));
    rows.push({ key: d.key, label: d.label, values: reasons.map((r, i) => (r ? `${strengthWord(r.score)} — ${r.summary}` : jobs[i].salaryMax == null && d.key === "compensation" ? "Not disclosed" : "—")) });
    const scored = reasons.map((r, i) => ({ i, s: r?.score })).filter((x): x is { i: number; s: number } => x.s != null);
    if (scored.length < 2) continue;
    const best = scored.reduce((a, b) => (b.s > a.s ? b : a));
    const rest = scored.filter((x) => x.i !== best.i);
    // Only call out a real difference, never a coin-flip.
    if (rest.every((x) => best.s - x.s >= 0.15)) observations.push(`${short(jobs[best.i])} ${d.observe}.`);
  }

  rows.push({ key: "hiring", label: "Hiring signals", values: jobs.map((j) => (quality[j.id] ? `${quality[j.id].confidence[0].toUpperCase()}${quality[j.id].confidence.slice(1)} confidence — ${quality[j.id].summary}` : "—")) });
  rows.push({ key: "trajectory", label: "Career trajectory", values: jobs.map((j) => trajectory(matches[j.id]?.reasons.find((r) => r.dimension === "seniority"))) });
  return { rows, observations };
}
