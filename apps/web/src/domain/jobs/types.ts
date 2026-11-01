import type { JobType, JobTypeFrom } from "./jobType";
import type { WorkMode } from "@/wonderworks/find/place";
export type { WorkMode };

/** How a work mode is written in the UI. Lives here, not in a component: server code (link-preview metadata) reads it too, and a value imported from a `"use client"` module resolves to a client reference on the server, not the object. */
export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export interface JobSource {
  id: string;
  name: string;
  /** Whether a real adapter exists. Marketing only shows sources where this is true. */
  integrated: boolean;
  enabled: boolean;
  reliability: "high" | "medium" | "low";
  color: string;
  short: string;
  website?: string;
  /** Shown in settings and run setup so the candidate knows what the source is. */
  note?: string;
  /** Needs server-side credentials before it can be searched. */
  requiresSetup?: boolean;
  /** Reported by the server at boot; undefined until known. */
  available?: boolean;
  /** The candidate switched this source on or off themselves — their choice then always stands. */
  chosen?: boolean;
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
  /** Full-time, part-time, contract… as the source reported it, or as the title says (`jobTypeFrom`). Absent when neither says. */
  jobType?: JobType;
  jobTypeFrom?: JobTypeFrom;
  /** What the listing is: a job (the default) or an event (dates, place; no employer or description needed). */
  kind?: ListingKind;
  /** A source's own extra fields as it states them (an event's startDate, endDate, online…). Never derived. */
  attributes?: ListingAttributes;
  /** Where postedAt came from: the source's own date, or when WorksLake first saw it (the source gave none). */
  postedAtFrom?: "source" | "first_seen";
}

export type ListingKind = "job" | "event";
export type ListingAttributes = Record<string, string | number | boolean>;

/** Deduplicated role, possibly seen on several sources. */
export interface CanonicalJob extends Omit<Job, "sourceId" | "externalId"> {
  canonicalKey: string;
  sourceIds: string[];
  duplicateOf: string[];
  /** Present when WorksLake found the job: where it was seen, which record is canonical, and why. */
  lake?: JobLakeProvenance;
  /** The candidate's role whose search found it (the latest search that did), when it ran as one. */
  foundAs?: { id: string; title: string };
}

/** One place a job was seen, as WorksLake recorded it. Display-only; never a job's identity. */
export interface JobSourceSighting {
  /** WorksLake source id (e.g. `greenhouse`) — may be one WonderJobs has no entry for. */
  sourceId: string;
  sourceName: string;
  provider: string;
  /** "API", "Feed", "MCP"… */
  accessLabel: string;
  employerSource: boolean;
  url: string;
  observedAt: string;
  canonical: boolean;
  /** The source's own id for this posting, as it sent it (e.g. `gh:acme:4012345`, an Adzuna number). */
  sourceJobId?: string;
}

/**
 * A source's job id as a person would read it: the last part of a prefixed id (`gh:acme:4012345` → `4012345`).
 * Nothing when the source only gave a link or something too long to be an id.
 */
export function readableJobId(id: string | undefined): string | null {
  const v = (id ?? "").trim();
  if (!v || /^https?:\/\//i.test(v)) return null;
  const last = v.split(":").pop()!.trim();
  return last && last.length <= 40 && !/\s/.test(last) ? last : null;
}

export interface JobLakeProvenance {
  opportunityId: string;
  sightings: JobSourceSighting[];
  employerVerified: boolean;
  /** Which source supplied the title, apply link and posting date. */
  fieldSources: { field: "title" | "canonicalApplyUrl" | "postedAt" | "compensation"; sourceName: string }[];
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
    | "last_observed"
    /** The model's read of the posting text (domain/jobs/aiFit.ts) — labelled as AI. */
    | "posting_content";
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
  /** Places the list is narrowed to and the next search looks in ("Mumbai", "Remote"); empty = anywhere, undefined = the profile's places. */
  locations?: string[];
  minSalary?: number;
  /** Only roles that state their pay. */
  salaryListed?: boolean;
  /** Levels to show (the posting's seniority); empty or undefined = every level. */
  levels?: Job["seniority"][];
  /** Job types to show (full-time, part-time, gig…); empty or undefined = every type, including postings that don't say. */
  jobTypes?: JobType[];
  /** Company name contains this. */
  company?: string;
  /** Only jobs in the candidate's own field — their Career Profile's headline and goal named in the title, skills, tags or requirements. */
  strictProfile?: boolean;
  /** Search the typed words only — the Career Profile neither fills in an empty search nor narrows what's shown ("Skip Career Profile"). */
  skipProfile?: boolean;
  /** Hide jobs that already have an application past Saved (Preparing, Submitted, Interview…) — they live in the Pipeline. */
  hideInPipeline?: boolean;
  /** Saved's own Easy Apply only: just the saved jobs posted on WonderJobs. Find's Refine uses `sourceIds` instead. */
  savedEasyApply?: boolean;
  /** Show postings older than two weeks too (they're hidden as "too old" otherwise; saved ones always show). */
  includeOld?: boolean;
  sourceIds: string[];
  minFit: FitLabel | null;
  /** Only jobs whose fit is exactly minFit (a count on Insights opens the jobs it counted). */
  exactFit?: boolean;
  freshnessDays: number | null;
  onlySaved: boolean;
}

export type JobSort = "best_match" | "date" | "salary";
