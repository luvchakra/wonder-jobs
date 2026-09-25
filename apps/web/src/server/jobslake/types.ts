import type { AccessStrategy, JobSourceDescriptor, SourceCategory, SourceStatus } from "@/domain/jobslake/protocol";
import type { AtsPlatform } from "@/domain/jobslake/detect";
import type { FeedConfig, JsonApiConfig, McpConfig, StructuredConfig } from "./custom";

/** Scraper governance (spec §46). Without an established permission a scraper is DO_NOT_USE. */
export interface ScraperGovernance {
  permission: "granted_in_writing" | "terms_permit" | "not_established" | "denied";
  termsReviewed: boolean;
  robotsReviewed: boolean;
  crawlDelaySec: number;
  maxConcurrency: number;
  failureThreshold: number;
  retentionDays: number;
  attribution: string;
  canonicalSourceUrl: string;
  notes?: string;
}

export type SourceConfig =
  | { kind: "builtin" }
  | { kind: "ats_board"; platform: AtsPlatform; slug: string; company: string; domain?: string }
  | { kind: "json_api"; api: JsonApiConfig }
  | { kind: "feed"; feed: FeedConfig }
  | { kind: "structured"; page: StructuredConfig }
  | { kind: "mcp"; mcp: McpConfig }
  | { kind: "scraper"; governance: ScraperGovernance }
  | { kind: "partnership" };

export interface SourceLimits {
  timeoutMs: number;
  maxResults: number;
  /** Minimum minutes between refreshes JobsLake itself triggers. */
  refreshMinutes: number;
}

export const DEFAULT_LIMITS: SourceLimits = { timeoutMs: 12_000, maxResults: 150, refreshMinutes: 120 };

export interface TestCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface TestReport {
  at: string;
  ok: boolean;
  durationMs: number;
  checks: TestCheck[];
  discovered: number;
  valid: number;
  duplicates: number;
  sampleTitles: string[];
  error?: string;
}

/** A source as JobsLake manages it. Never contains a credential — only `secretRef`. */
export interface SourceRecord extends JobSourceDescriptor {
  category: SourceCategory;
  accessStrategy: AccessStrategy;
  status: SourceStatus;
  statusReason?: string;
  description: string;
  geography: string[];
  roleFamilies: string[];
  capabilities: string[];
  config: SourceConfig;
  secretRef?: string;
  limits: SourceLimits;
  /** The WonderJobs source id candidates toggle this under ("careers" for every ATS). */
  legacySourceId?: string;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  lastTest?: TestReport;
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  sourceId?: string;
  detail?: Record<string, unknown>;
}

export interface StoredCredential {
  ref: string;
  ciphertext: string;
  masked: string;
  createdAt: string;
  replacedAt?: string;
}
