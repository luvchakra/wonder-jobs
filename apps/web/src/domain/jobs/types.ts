export type WorkMode = "remote" | "hybrid" | "onsite";

export interface JobSource {
  id: string;
  name: string;
  /** Whether a real adapter exists. Marketing only shows sources where this is true. */
  integrated: boolean;
  enabled: boolean;
  reliability: "high" | "medium" | "low";
  color: string;
  short: string;
}

/** A raw posting as observed on one source. */
export interface Job {
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  company: string;
  companyDomain?: string;
  location: string;
  country: string;
  workMode: WorkMode;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  postedAt: string;
  observedAt: string;
  description: string;
  requirements: string[];
  niceToHave: string[];
  skills: string[];
  seniority: "junior" | "mid" | "senior" | "lead" | "director";
  industry: string;
  applyUrl: string;
  applyPath: "employer_site" | "platform" | "email" | "unknown";
  onEmployerSite: boolean;
  repostCount: number;
  tags: string[];
}

/** Deduplicated role, possibly seen on several sources. */
export interface CanonicalJob extends Omit<Job, "sourceId" | "externalId"> {
  canonicalKey: string;
  sourceIds: string[];
  duplicateOf: string[];
}

export type FitLabel = "strong" | "worth_considering" | "stretch" | "low_fit";

export const FIT_META: Record<FitLabel, { label: string; tone: "success" | "brand" | "warning" | "neutral" }> = {
  strong: { label: "Strong Opportunity", tone: "success" },
  worth_considering: { label: "Worth Considering", tone: "brand" },
  stretch: { label: "Stretch Opportunity", tone: "warning" },
  low_fit: { label: "Low-Fit Opportunity", tone: "neutral" },
};

export interface AlignmentReason {
  dimension: "skills" | "seniority" | "industry" | "career_goal" | "location" | "compensation";
  label: string;
  score: number; // 0..1
  summary: string;
}

export interface JobMatch {
  jobId: string;
  score: number; // 0..100 — presented with fit labels, never as an absolute
  fit: FitLabel;
  reasons: AlignmentReason[];
  highlights: string[]; // short chips, e.g. "High relevance"
  computedAt: string;
}

export interface JobQualitySignal {
  key:
    | "freshness"
    | "repost"
    | "duplicates"
    | "apply_destination"
    | "employer_site"
    | "salary_transparency"
    | "source_reliability"
    | "apply_path"
    | "last_observed";
  label: string;
  value: string;
  sentiment: "positive" | "neutral" | "caution";
}

export type HiringConfidence = "high" | "moderate" | "low";

export interface JobQuality {
  jobId: string;
  confidence: HiringConfidence;
  summary: string;
  signals: JobQualitySignal[];
}

export interface SavedJob {
  jobId: string;
  savedAt: string;
  note?: string;
}

export type JobDecision = "saved" | "not_for_me";

export interface JobFilters {
  query: string;
  workModes: WorkMode[];
  minSalary?: number;
  sourceIds: string[];
  minFit: FitLabel | null;
  freshnessDays: number | null;
  onlySaved: boolean;
}

export type JobSort = "best_match" | "date" | "salary";
