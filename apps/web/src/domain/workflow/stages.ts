import type { Capability, RiskClass } from "@/domain/automation/policy";

/** The 12 observable workflow stages (spec §8) in execution order. */
export const STAGE_KEYS = [
  "profile",
  "search",
  "dedupe",
  "understand",
  "match",
  "quality",
  "rank",
  "prepare",
  "review",
  "apply",
  "track",
  "learn",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export interface StageDefinition {
  key: StageKey;
  name: string;
  /** Present-tense line shown while the stage is running. */
  activeLabel: string;
  risk: RiskClass;
  /** Capabilities exercised by this stage; policy decides whether it may run unattended. */
  capabilities: Capability[];
  /** Stage always pauses for the user (e.g. review). */
  requiresUser?: boolean;
  /** Stage performs external side effects and must be idempotent. */
  external?: boolean;
  unit?: string;
}

export const STAGES: Record<StageKey, StageDefinition> = {
  profile: { key: "profile", name: "Understanding your profile", activeLabel: "Reading your Career Profile", risk: "low", capabilities: [], unit: "profile" },
  search: { key: "search", name: "Searching job sources", activeLabel: "Searching job sources", risk: "low", capabilities: ["search_jobs"], unit: "jobs" },
  dedupe: { key: "dedupe", name: "Removing duplicates", activeLabel: "Removing duplicates", risk: "low", capabilities: ["deduplicate"], unit: "jobs" },
  understand: { key: "understand", name: "Understanding opportunities", activeLabel: "Analyzing opportunities", risk: "low", capabilities: ["analyze_jobs"], unit: "jobs" },
  match: { key: "match", name: "Matching with your career goals", activeLabel: "Matching to your profile", risk: "low", capabilities: ["analyze_jobs"], unit: "jobs" },
  quality: { key: "quality", name: "Checking job quality", activeLabel: "Checking hiring signals", risk: "low", capabilities: ["analyze_jobs"], unit: "jobs" },
  rank: { key: "rank", name: "Prioritizing opportunities", activeLabel: "Ranking opportunities", risk: "low", capabilities: ["rank_opportunities", "save_jobs"], unit: "jobs" },
  prepare: { key: "prepare", name: "Preparing application materials", activeLabel: "Tailoring materials", risk: "medium", capabilities: ["generate_resume", "generate_cover_letter"], unit: "applications" },
  review: { key: "review", name: "Waiting for your review", activeLabel: "Waiting for your review", risk: "low", capabilities: [], requiresUser: true, unit: "applications" },
  apply: { key: "apply", name: "External application", activeLabel: "Submitting approved applications", risk: "high", capabilities: ["submit_application"], external: true, unit: "applications" },
  track: { key: "track", name: "Tracking", activeLabel: "Updating your application tracker", risk: "low", capabilities: [], unit: "applications" },
  learn: { key: "learn", name: "Learning", activeLabel: "Learning from this run", risk: "low", capabilities: [], unit: "insights" },
};

export const STAGE_ORDER: Record<StageKey, number> = Object.fromEntries(STAGE_KEYS.map((k, i) => [k, i])) as Record<StageKey, number>;

export function stagesFrom(key: StageKey): StageKey[] {
  return STAGE_KEYS.slice(STAGE_ORDER[key]);
}
