/**
 * JobsLake Protocol v1 — the contract between JobsLake (job-market acquisition, normalization,
 * dedupe, provenance) and WonderJobs (candidate intelligence). WonderJobs receives
 * `CanonicalOpportunity`, never a source-specific job shape (spec §2.3, §29).
 *
 * Pure types and validation only: nothing here fetches, stores or knows about a candidate.
 */
import type { WorkMode } from "@/domain/jobs/types";

export const PROTOCOL_VERSION = "1.0" as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/* ------------------------------------------------------------------ sources */

export type SourceCategory = "portal" | "ats" | "aggregator" | "specialist" | "government";
export type AccessStrategy = "official_api" | "official_feed" | "partner_api" | "mcp" | "licensed" | "structured" | "scraper";
export type SourceStatus = "draft" | "testing" | "active" | "paused" | "degraded" | "disabled" | "do_not_use";

/** The explicit access label shown next to every source (spec §23). */
export const ACCESS_LABEL: Record<AccessStrategy, string> = {
  official_api: "API",
  official_feed: "Feed",
  partner_api: "Partner API",
  mcp: "MCP",
  licensed: "Licensed",
  structured: "Structured",
  scraper: "Scraper",
};

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  portal: "Job portal",
  ats: "Employer career site / ATS",
  aggregator: "Job aggregator",
  specialist: "Specialist board",
  government: "Government / public",
};

export const STATUS_LABEL: Record<SourceStatus, string> = {
  draft: "Draft",
  testing: "Testing",
  active: "Active",
  paused: "Paused",
  degraded: "Degraded",
  disabled: "Disabled",
  do_not_use: "Do not use",
};

/**
 * Evidence authority, strongest first (spec §30): employer/ATS → licensed feed → portal →
 * aggregator. A weaker source never overwrites a field a stronger one supplied.
 */
export function sourceAuthority(s: Pick<JobSourceDescriptor, "category" | "accessStrategy">): number {
  if (s.category === "ats") return 4;
  if (s.accessStrategy === "licensed" || s.accessStrategy === "partner_api") return 3;
  if (s.category === "portal" || s.category === "government" || s.category === "specialist") return 2;
  return 1;
}

export interface JobSourceDescriptor {
  id: string;
  name: string;
  /** Who operates the platform behind it — "Greenhouse", "Adzuna", "Remote OK". */
  provider: string;
  category: SourceCategory;
  accessStrategy: AccessStrategy;
  protocolVersion: ProtocolVersion;
}

/* ------------------------------------------------------------ opportunities */

export type Confidence = "high" | "medium" | "low";

/** One observation of a posting on one source. */
export interface SourceRecord {
  sourceId: string;
  sourceName: string;
  provider: string;
  category: SourceCategory;
  accessStrategy: AccessStrategy;
  /** The source's own id for the posting. */
  sourceJobId: string;
  /** Where the posting lives on that source. */
  url: string;
  observedAt: string;
  /**
   * The id WonderJobs has always given this posting (`careers_…`, `remotive_…`). Carried so saved
   * jobs, applications and the browser extension keep resolving after the move to JobsLake.
   */
  legacyJobId: string;
  /** The WonderJobs source id that posting belongs to (`careers`, `remotive`, or a platform-managed JobsLake source id). */
  legacySourceId: string;
  /** True for the record the canonical fields were taken from. */
  canonical: boolean;
}

export type ProvenanceField = "title" | "employer" | "locations" | "description" | "compensation" | "postedAt" | "canonicalApplyUrl" | "workplaceType";

export interface FieldProvenance {
  field: ProvenanceField;
  sourceId: string;
  observedAt: string;
  confidence: Confidence;
}

export interface Compensation {
  min?: number;
  max?: number;
  currency: string;
}

export interface QualityMetadata {
  requiredFieldsPresent: boolean;
  validApplyUrl: boolean;
  compensationDisclosed: boolean;
  /** At least one record came from the employer's own career site or ATS. */
  employerVerified: boolean;
  sourceCount: number;
}

export interface FreshnessMetadata {
  postedAt: string;
  lastObservedAt: string;
  ageDays: number;
}

export interface CanonicalOpportunity {
  id: string;
  protocolVersion: ProtocolVersion;
  employer: { name: string; domain?: string };
  title: string;
  normalizedTitle: string;
  locations: string[];
  country: string;
  workplaceType: WorkMode;
  compensation?: Compensation;
  description: string;
  requirements: string[];
  niceToHave: string[];
  skills: string[];
  /** Enrichment JobsLake derives from the posting text — labelled derived, never presented as fact. */
  enrichment: { seniority: "junior" | "mid" | "senior" | "lead" | "director"; industry: string; tags: string[] };
  postedAt: string;
  canonicalApplyUrl: string;
  applyPath: "employer_site" | "platform" | "email" | "unknown";
  sourceRecords: SourceRecord[];
  provenance: FieldProvenance[];
  quality: QualityMetadata;
  freshness: FreshnessMetadata;
}

/* --------------------------------------------------------------- searching */

export type SearchMode = "fast" | "balanced" | "maximum_coverage";

export const SEARCH_MODE_META: Record<SearchMode, { label: string; description: string }> = {
  fast: { label: "Fast", description: "Recent results and the highest-yield sources, with your exact terms." },
  balanced: { label: "Balanced", description: "Recent results plus every healthy source that fits the search." },
  maximum_coverage: { label: "Maximum coverage", description: "Every eligible source, searched deeper. Slower." },
};

/**
 * What WonderJobs sends. Deliberately the minimum needed to search (spec §57): role terms,
 * locations, seniority and a few filters — never résumé text, notes or AI reasoning.
 */
export interface SearchRequest {
  query: {
    text: string;
    titles?: string[];
    skills?: string[];
    locations: string[];
    seniority?: string[];
  };
  filters?: { freshnessDays?: number; workplaceTypes?: WorkMode[] };
  /** Restrict to these sources (the candidate's own source choices). */
  sourceIds?: string[];
  searchMode: SearchMode;
  limit: number;
  /** End-to-end correlation (spec §83). Opaque to JobsLake. */
  correlationId?: string;
}

export type SourceOutcome = "ok" | "empty" | "needs_setup" | "timeout" | "unavailable" | "skipped";

export interface SourceSearchStatus {
  sourceId: string;
  sourceName: string;
  outcome: SourceOutcome;
  retrieved: number;
  durationMs: number;
  /** Safe, human-readable — never a credential, hostname-internal detail or stack trace. */
  message?: string;
  runId?: string;
}

export interface SearchMetadata {
  retrieved: number;
  normalized: number;
  duplicates: number;
  unique: number;
  sourcesPlanned: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  warm: number;
  live: number;
}

export interface SearchResponse {
  requestId: string;
  protocolVersion: ProtocolVersion;
  searchMode: SearchMode;
  results: CanonicalOpportunity[];
  sources: SourceSearchStatus[];
  metadata: SearchMetadata;
}

/** Streaming search events (spec §36). Every event reflects work that actually happened. */
export type SearchEvent =
  | { type: "search_started"; requestId: string; plannedSources: { id: string; name: string }[]; searchMode: SearchMode }
  | { type: "source_started"; sourceId: string; sourceName: string }
  | { type: "source_completed"; status: SourceSearchStatus }
  | { type: "jobs_retrieved"; sourceId: string; count: number; totalRetrieved: number }
  | { type: "dedupe_progress"; unique: number; duplicates: number }
  | { type: "search_completed"; response: SearchResponse }
  | { type: "error"; error: ErrorBody };

/* ------------------------------------------------------------------ errors */

export type ErrorCode = "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE" | "SOURCE_NEEDS_SETUP" | "DESTINATION_BLOCKED" | "VALIDATION_FAILED" | "FEATURE_DISABLED" | "INTERNAL";

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  sourceId?: string;
  requestId?: string;
}

/* -------------------------------------------------------------- validation */

export interface ValidationIssue {
  field: string;
  problem: string;
}

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};
const isIsoDate = (v: string) => !Number.isNaN(Date.parse(v));

/**
 * The protocol validator (spec §70): a record that fails it cannot be served, and a source whose
 * test run produces failures cannot become Active.
 */
export function validateOpportunity(o: CanonicalOpportunity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (o.protocolVersion !== PROTOCOL_VERSION) issues.push({ field: "protocolVersion", problem: `must be ${PROTOCOL_VERSION}` });
  if (!o.id) issues.push({ field: "id", problem: "missing" });
  if (!o.title?.trim()) issues.push({ field: "title", problem: "missing" });
  if (!o.employer?.name?.trim() || o.employer.name === "Unknown company") issues.push({ field: "employer.name", problem: "employer identity missing" });
  if (!o.canonicalApplyUrl || !isHttpUrl(o.canonicalApplyUrl)) issues.push({ field: "canonicalApplyUrl", problem: "not a valid http(s) URL" });
  if (!o.postedAt || !isIsoDate(o.postedAt)) issues.push({ field: "postedAt", problem: "not a valid date" });
  if (!Array.isArray(o.locations) || !o.locations.length) issues.push({ field: "locations", problem: "missing" });
  if (!o.description?.trim()) issues.push({ field: "description", problem: "missing" });
  if (!o.sourceRecords?.length) issues.push({ field: "sourceRecords", problem: "no source record" });
  for (const r of o.sourceRecords ?? []) {
    if (!r.sourceId || !r.sourceJobId) issues.push({ field: "sourceRecords", problem: "record without source id" });
    if (!isIsoDate(r.observedAt)) issues.push({ field: "sourceRecords.observedAt", problem: "not a valid date" });
  }
  if (!o.provenance?.some((p) => p.field === "title")) issues.push({ field: "provenance", problem: "title has no provenance" });
  return issues;
}
