/**
 * What stands between a signed-in candidate and a list of relevant jobs — computed from what they
 * already have, every time the jobs screen opens. At most one blocker is shown, the first one on the
 * ladder; everything else that weakens relevance is a note with one action. Nothing here invents a
 * value: a suggestion is always the candidate's own (their latest job title, their own location).
 */
import type { CareerDNA } from "@/domain/career/types";
import type { CareerRole } from "@/domain/career/roles";
import type { JobSource } from "@/domain/jobs/types";
import type { Workflow, WorkflowRun } from "@/domain/workflow/types";
import { historyOf } from "@/domain/career/history";
import { corePhrase, defaultSearchQuery, hasTermOrSynonym, queryTerms, SENIORITY_WORDS } from "@/services/jobs/normalize";
import { fieldTerms, GENERIC_SKILLS } from "@/services/jobs/matching";

export type ReadinessBlocker =
  /** Nothing to search with: no headline, goal, skills or work history. */
  | { kind: "profile"; hasResume: boolean; resumeFileId?: string }
  /** A profile, but no role can be read from it. `suggested` is their own latest job title, when there is one. */
  | { kind: "role"; suggested?: string }
  /** No job source can be searched on this deployment. */
  | { kind: "sources"; needsSetup: string[]; off: string[] };

export type RelevanceNote =
  /** A saved scheduled search looks for something outside the candidate's field (e.g. a query saved before the profile changed). */
  | { kind: "stale_schedule"; workflowId: string; name: string; query: string; suggested: string }
  /** Every skill in the profile is one most roles share, so matching can't tell their field apart. */
  | { kind: "generic_skills"; skills: string[]; resumeFileId?: string }
  /** A role whose search is only a level ("senior director") — it would match every field. */
  | { kind: "role_without_field"; roleId: string; title: string }
  /** No preferred location: nearby jobs can't be ranked above far ones. `suggested` is the candidate's own location, when known. */
  | { kind: "no_location"; suggested?: string };

export interface Readiness {
  blocker?: ReadinessBlocker;
  /** What the boards are asked for (empty when blocked on profile/role). */
  query: string;
  locations: string[];
  /** The words that name the candidate's field — what matching looks for. */
  field: string[];
  notes: RelevanceNote[];
}

export interface ReadinessInput {
  dna: CareerDNA;
  roles: CareerRole[];
  sources: JobSource[];
  /** The candidate's uploaded résumé ids, base first. */
  resumeFileIds: string[];
  /** Workflows behind the candidate's scheduled searches. */
  scheduledWorkflows: Workflow[];
}

const hasProfile = (dna: CareerDNA) => !!(dna.headline.trim() || dna.careerGoal.trim() || dna.skills.length || historyOf(dna).experience.length);

/** A query is only a level when, without seniority words, nothing is left ("senior director"). */
export const onlyLevel = (query: string) => queryTerms(query).length > 0 && queryTerms(query).every((t) => SENIORITY_WORDS.has(t));

export function jobsReadiness(input: ReadinessInput): Readiness {
  const { dna } = input;
  const field = fieldTerms(dna.headline, dna.careerGoal);
  const query = defaultSearchQuery(dna);
  const locations = dna.preferredLocations;
  const notes: RelevanceNote[] = [];
  const latestTitle = historyOf(dna).experience.find((e) => e.current)?.title ?? historyOf(dna).experience[0]?.title;

  let blocker: ReadinessBlocker | undefined;
  const usable = input.sources.filter((s) => s.integrated && s.enabled && s.available !== false);
  if (!hasProfile(dna)) blocker = { kind: "profile", hasResume: input.resumeFileIds.length > 0, resumeFileId: input.resumeFileIds[0] };
  else if (!query || onlyLevel(query)) blocker = { kind: "role", suggested: latestTitle?.trim() || undefined };
  else if (!usable.length)
    blocker = { kind: "sources", needsSetup: input.sources.filter((s) => s.integrated && s.available === false).map((s) => s.name), off: input.sources.filter((s) => s.integrated && !s.enabled && s.available !== false).map((s) => s.name) };

  if (!blocker) {
    // Saved searches that look outside the field (the reported case: "product manager" for an IAM director).
    for (const wf of input.scheduledWorkflows) {
      const q = wf.config.searchCriteria.query;
      if (wf.config.role || !q.trim() || q.trim().toLowerCase() === query.toLowerCase()) continue;
      const core = queryTerms(corePhrase(q));
      if (field.length && core.length && !core.some((t) => field.some((f) => t === f || hasTermOrSynonym(t, f) || hasTermOrSynonym(f, t)))) notes.push({ kind: "stale_schedule", workflowId: wf.id, name: wf.name, query: q, suggested: query });
    }
    const specific = dna.skills.filter((s) => !GENERIC_SKILLS.has(s.name.toLowerCase()));
    if (dna.skills.length && specific.length < Math.min(3, dna.skills.length)) notes.push({ kind: "generic_skills", skills: dna.skills.slice(0, 5).map((s) => s.name), resumeFileId: input.resumeFileIds[0] });
    for (const r of input.roles) if (!r.query.trim() && onlyLevel(defaultSearchQuery({ headline: r.title, careerGoal: r.goal }))) notes.push({ kind: "role_without_field", roleId: r.id, title: r.title });
    if (!locations.length) notes.push({ kind: "no_location", suggested: historyOf(dna).contact.location?.trim() || undefined });
  }
  return { blocker, query: blocker?.kind === "profile" || blocker?.kind === "role" ? "" : query, locations, field, notes };
}

/* ------------------------------------------------------------ auto-search */

const SEARCH_STAGES = new Set(["search"]);
const STALE_MS = 12 * 3_600_000;
const RECENT_FAILURE_MS = 10 * 60_000;

export type AutoSearchDecision = { run: true; reason: "first" | "changed" | "empty" | "stale" } | { run: false; reason: "blocked" | "active" | "fresh" | "failed_recently" | "demo" };

/** The most recent run that searched for jobs. */
export function latestSearchRun(runs: WorkflowRun[]): WorkflowRun | undefined {
  return runs.filter((r) => r.stages.some((s) => SEARCH_STAGES.has(s.key))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * Whether opening the jobs screen should search now, without a button: never when something blocks
 * it or a run is already going; yes when there's never been a search, the profile's search changed,
 * the catalog is empty, or the last search is more than 12 hours old. A search that failed in the last
 * ten minutes isn't retried on its own — its reason is shown instead.
 */
export function autoSearchDecision(p: { readiness: Readiness; mode: "user" | "demo" | "local"; activeRun: boolean; last?: WorkflowRun; catalogSize: number; now: number }): AutoSearchDecision {
  if (p.mode !== "user") return { run: false, reason: "demo" };
  if (p.readiness.blocker) return { run: false, reason: "blocked" };
  if (p.activeRun) return { run: false, reason: "active" };
  const last = p.last;
  if (!last) return { run: true, reason: "first" };
  const at = Date.parse(last.completedAt ?? last.createdAt);
  if (last.status === "FAILED" && p.now - at < RECENT_FAILURE_MS) return { run: false, reason: "failed_recently" };
  if (!last.config.role && last.config.searchCriteria.query.trim().toLowerCase() !== p.readiness.query.toLowerCase()) return { run: true, reason: "changed" };
  if (p.catalogSize === 0) return { run: true, reason: "empty" };
  if (p.now - at > STALE_MS) return { run: true, reason: "stale" };
  return { run: false, reason: "fresh" };
}

/* ------------------------------------------------------------- widening */

/**
 * When a search found nothing, the next wider one and what was let go, in order: the location, then
 * the level words. Null when there's nothing left to widen — the empty state then says so.
 */
export function widenSearch(query: string, locations: string[]): { query: string; locations: string[]; dropped: string } | null {
  if (locations.length) return { query, locations: [], dropped: `the location (${locations.join(", ")})` };
  const core = corePhrase(query);
  if (core && core !== queryTerms(query).join(" ")) return { query: core, locations: [], dropped: "the level words" };
  return null;
}

/** Stages of a search-only run: the jobs, matched and ranked — applications are prepared later, from a job. */
export const SEARCH_ONLY_STAGES = ["profile", "search", "dedupe", "match", "quality", "rank"] as const;
