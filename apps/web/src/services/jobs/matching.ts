/**
 * WonderJobs AI matching + job-quality heuristics. Deterministic, explainable,
 * and honest about uncertainty: scores are presented with fit labels, quality
 * with confidence language and evidence (spec §13–15).
 */
import type { CareerDNA } from "@/domain/career/types";
import type { AlignmentReason, CanonicalJob, FitLabel, HiringConfidence, Job, JobMatch, JobQuality, JobQualitySignal, JobSource } from "@/domain/jobs/types";
import { hashKey } from "@/lib/ids";

const DAY = 86_400_000;
const SENIORITY_RANK = { junior: 0, mid: 1, senior: 2, lead: 3, director: 4 } as const;

export function canonicalKey(job: Pick<Job, "title" | "company" | "location">) {
  const norm = (s: string) => s.toLowerCase().replace(/\bsr\.?\b/g, "senior").replace(/[^a-z0-9]+/g, " ").trim();
  return hashKey(`${norm(job.title)}|${norm(job.company)}|${norm(job.location)}`);
}

/** Collapse raw postings into canonical roles; returns canonical jobs in first-seen order. */
export function deduplicate(jobs: Job[]): CanonicalJob[] {
  const byKey = new Map<string, CanonicalJob>();
  for (const j of jobs) {
    const key = canonicalKey(j);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sourceIds.includes(j.sourceId)) existing.sourceIds.push(j.sourceId);
      existing.duplicateOf.push(j.id);
      if (j.observedAt > existing.observedAt) existing.observedAt = j.observedAt;
      continue;
    }
    const { sourceId, externalId: _ext, ...rest } = j;
    void _ext;
    byKey.set(key, { ...rest, canonicalKey: key, sourceIds: [sourceId], duplicateOf: [] });
  }
  return [...byKey.values()];
}

export function fitLabel(score: number): FitLabel {
  if (score >= 85) return "strong";
  if (score >= 70) return "worth_considering";
  if (score >= 55) return "stretch";
  return "low_fit";
}

export interface MatchContext {
  dna: CareerDNA;
  /** Overrides resolved by the workflow (user values win). */
  preferredLocations?: string[];
  minSalary?: number;
  careerGoal?: string;
}

export function computeMatch(job: CanonicalJob | Job, ctx: MatchContext, now = Date.now()): JobMatch {
  const { dna } = ctx;
  const goal = (ctx.careerGoal ?? dna.careerGoal).toLowerCase();
  const locations = (ctx.preferredLocations ?? dna.preferredLocations).map((l) => l.toLowerCase());
  const minSalary = ctx.minSalary ?? dna.minSalary;

  // skills
  const mine = new Map(dna.skills.map((s) => [s.name.toLowerCase(), s.level]));
  const overlap = job.skills.filter((s) => mine.has(s.toLowerCase()));
  const skillScore = job.skills.length ? Math.min(1, overlap.reduce((n, s) => n + mine.get(s.toLowerCase())! / 5, 0) / job.skills.length + (overlap.length >= 4 ? 0.08 : 0)) : 0.5;

  // seniority
  const delta = SENIORITY_RANK[job.seniority] - SENIORITY_RANK[dna.seniority];
  const seniorityScore = delta === 0 ? 1 : delta === 1 ? 0.8 : delta === -1 ? 0.65 : delta > 1 ? 0.35 : 0.3;

  // industry
  const industryScore = dna.industries.some((i) => i.toLowerCase() === job.industry.toLowerCase()) ? 1 : 0.55;

  // career goal (title keywords)
  const title = job.title.toLowerCase();
  const goalWords = goal.split(/[^a-z]+/).filter((w) => w.length > 3 && !["roles", "find", "with", "companies", "tech"].includes(w));
  const goalHits = goalWords.filter((w) => title.includes(w)).length;
  const goalScore = goalWords.length ? Math.min(1, 0.35 + goalHits / Math.min(2, goalWords.length)) : 0.6;

  // location
  const jl = job.location.toLowerCase();
  const locationScore = job.workMode === "remote" || locations.some((l) => jl.includes(l.replace(", india", "")) || (l === "remote" && jl.includes("remote"))) ? 1 : locations.some((l) => l.includes("india") && jl.includes("india")) ? 0.6 : 0.3;

  // compensation
  let compScore = 0.7; // unknown salary — neutral, flagged in quality
  if (job.salaryMax != null && minSalary != null) {
    const max = job.currency === "INR" ? job.salaryMax : job.salaryMax * 30;
    compScore = max >= minSalary * 1.15 ? 1 : max >= minSalary ? 0.85 : max >= minSalary * 0.85 ? 0.55 : 0.3;
  }

  const weights = { skills: 0.32, seniority: 0.18, industry: 0.1, career_goal: 0.18, location: 0.12, compensation: 0.1 } as const;
  const raw = skillScore * weights.skills + seniorityScore * weights.seniority + industryScore * weights.industry + goalScore * weights.career_goal + locationScore * weights.location + compScore * weights.compensation;
  const score = Math.round(Math.max(20, Math.min(96, raw * 100)));

  const reasons: AlignmentReason[] = [
    { dimension: "skills", label: "Skill alignment", score: skillScore, summary: overlap.length ? `${overlap.length} of ${job.skills.length} listed skills match your Career DNA (${overlap.slice(0, 3).join(", ")}).` : "Few of the listed skills appear in your Career DNA." },
    { dimension: "seniority", label: "Seniority alignment", score: seniorityScore, summary: delta === 0 ? "Same level as your current role." : delta === 1 ? "One step up — a growth move." : delta > 1 ? "Two or more levels above your current role." : "Below your current level." },
    { dimension: "industry", label: "Industry alignment", score: industryScore, summary: industryScore === 1 ? `${job.industry} is one of your target industries.` : `${job.industry} is outside your listed industries.` },
    { dimension: "career_goal", label: "Career-goal alignment", score: goalScore, summary: goalHits ? "The role title matches your stated career goal." : "The role is adjacent to your stated goal." },
    { dimension: "location", label: "Location alignment", score: locationScore, summary: locationScore === 1 ? `${job.location} (${job.workMode}) fits your preferences.` : `${job.location} is outside your preferred locations.` },
    { dimension: "compensation", label: "Compensation alignment", score: compScore, summary: job.salaryMax == null ? "Salary not disclosed." : compScore >= 0.85 ? "Range meets or exceeds your minimum." : "Range is below your minimum." },
  ];

  const highlights: string[] = [];
  if (skillScore >= 0.75) highlights.push("High relevance");
  if (compScore >= 0.85 && job.salaryMax != null) highlights.push("Good salary");
  if (delta === 1) highlights.push("Growth move");
  if (job.workMode === "remote") highlights.push("Remote");
  if (now - new Date(job.postedAt).getTime() < 3 * DAY) highlights.push("New");

  return { jobId: job.id, score, fit: fitLabel(score), reasons, highlights: highlights.slice(0, 3), computedAt: new Date(now).toISOString() };
}

export function computeQuality(job: CanonicalJob | Job, sources: Record<string, JobSource>, now = Date.now()): JobQuality {
  const ageDays = Math.floor((now - new Date(job.postedAt).getTime()) / DAY);
  const sourceIds = "sourceIds" in job ? job.sourceIds : [job.sourceId];
  const reliabilities = sourceIds.map((id) => sources[id]?.reliability ?? "medium");
  const bestReliability = reliabilities.includes("high") ? "high" : reliabilities.includes("medium") ? "medium" : "low";
  const signals: JobQualitySignal[] = [
    { key: "freshness", label: "Posting freshness", value: ageDays === 0 ? "Posted today" : `Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`, sentiment: ageDays <= 7 ? "positive" : ageDays <= 21 ? "neutral" : "caution" },
    { key: "repost", label: "Repeated posting", value: job.repostCount ? `Reposted ${job.repostCount}×` : "Not reposted", sentiment: job.repostCount ? "caution" : "positive" },
    { key: "duplicates", label: "Duplicate postings", value: sourceIds.length > 1 ? `Seen on ${sourceIds.length} platforms` : "Single listing", sentiment: "neutral" },
    { key: "apply_destination", label: "Application destination", value: job.applyPath === "employer_site" ? "Employer career site" : job.applyPath === "platform" ? "Job platform form" : job.applyPath === "email" ? "Email" : "Unknown", sentiment: job.applyPath === "employer_site" ? "positive" : job.applyPath === "unknown" ? "caution" : "neutral" },
    { key: "employer_site", label: "Employer career-page presence", value: job.onEmployerSite ? "Listed on employer site" : "Not found on employer site", sentiment: job.onEmployerSite ? "positive" : "caution" },
    { key: "salary_transparency", label: "Salary transparency", value: job.salaryMax != null ? "Salary range provided" : "Salary not provided", sentiment: job.salaryMax != null ? "positive" : "neutral" },
    { key: "source_reliability", label: "Source reliability", value: `${bestReliability[0].toUpperCase()}${bestReliability.slice(1)}`, sentiment: bestReliability === "high" ? "positive" : bestReliability === "medium" ? "neutral" : "caution" },
    { key: "apply_path", label: "Application path", value: job.applyPath === "unknown" ? "Unclear" : "Direct", sentiment: job.applyPath === "unknown" ? "caution" : "positive" },
    { key: "last_observed", label: "Last observed", value: new Date(job.observedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), sentiment: "neutral" },
  ];
  const positives = signals.filter((s) => s.sentiment === "positive").length;
  const cautions = signals.filter((s) => s.sentiment === "caution").length;
  const confidence: HiringConfidence = cautions >= 3 || ageDays > 30 ? "low" : positives >= 6 && cautions === 0 ? "high" : "moderate";
  const parts: string[] = [];
  parts.push(ageDays <= 7 ? "The role is recent" : ageDays <= 21 ? "The role is a few weeks old" : "The role has been open for a while");
  parts.push(job.onEmployerSite ? "and appears on the employer career site." : "but was not found on the employer career site.");
  if (job.salaryMax == null) parts.push("Salary information is not provided.");
  if (job.repostCount) parts.push(`It has been reposted ${job.repostCount} time${job.repostCount === 1 ? "" : "s"}.`);
  return { jobId: job.id, confidence, summary: parts.join(" "), signals };
}
