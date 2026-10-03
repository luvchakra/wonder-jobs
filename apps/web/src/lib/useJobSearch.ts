"use client";
import { useCallback, useEffect, useMemo } from "react";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { autoSearchDecision, jobsReadiness, latestSearchRun, SEARCH_ONLY_STAGES, widenSearch, type Readiness } from "@/domain/jobs/readiness";
import type { WorkflowRun } from "@/domain/workflow/types";
import { getWorkflowService } from "@/services/workflow/service";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { useAuthStore } from "@/store/auth";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { track } from "@/lib/analytics";

/** Searches already started from this screen in this page session, so a re-render never starts the same one twice. */
const started = new Set<string>();
/** Why a run searched more widely than the profile asked: run id → plain words. */
const widenedBecause = new Map<string, string>();

/** A run that finished with no postings matching (not a source failure). */
export const foundNothing = (run: WorkflowRun | undefined) => run?.status === "FAILED" && run.error?.category === "user_action_required" && /^No jobs matched/.test(run.error.message);

export interface JobSearch {
  readiness: Readiness;
  /** The search running now, if any. */
  active?: WorkflowRun;
  /** The latest search, running or finished. */
  last?: WorkflowRun;
  /** Why the latest search was wider than the profile asked, when it was. */
  widened?: string;
  /** Search now with the profile's own terms (or the given ones). */
  search: (opts?: { query?: string; locations?: string[] }) => WorkflowRun | null;
}

/**
 * The jobs screen's engine: what blocks relevant jobs (if anything), and searching without a button —
 * on open when the results are missing, stale or for a different search, and once more, wider, when a
 * search found nothing. Search-only runs: finding, matching and ranking; applications are prepared
 * later, from a job, by the candidate.
 */
export function useJobSearch(): JobSearch {
  const dna = useCareerStore((s) => s.dna);
  const roles = useCareerStore((s) => s.roles ?? []);
  const baseResume = useCareerStore((s) => s.baseResume);
  const sources = useJobsStore((s) => s.sources);
  const order = useJobsStore((s) => s.order);
  const rejected = useJobsStore((s) => s.rejected);
  const files = useResumeFilesStore((s) => s.files);
  const loadFiles = useResumeFilesStore((s) => s.load);
  const runs = useWorkflowStore((s) => s.runs);
  const workflows = useWorkflowStore((s) => s.workflows);
  const schedules = useWorkflowStore((s) => s.schedules);
  const active = useWorkflowStore(selectActiveRun);
  const mode = useAuthStore((s) => s.mode);
  const level = useAutomationStore((s) => s.defaultLevel);
  const ai = useAIStore((s) => s.config);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const resumeFileIds = useMemo(() => {
    const base = baseResume?.kind === "upload" ? baseResume.id : undefined;
    return [...files.map((f) => f.id)].sort((a, b) => Number(b === base) - Number(a === base));
  }, [files, baseResume]);
  const scheduledWorkflows = useMemo(() => Object.values(schedules).map((s) => workflows[s.workflowId]).filter((w): w is NonNullable<typeof w> => !!w), [schedules, workflows]);
  const readiness = useMemo(() => jobsReadiness({ dna, roles, sources, resumeFileIds, scheduledWorkflows }), [dna, roles, sources, resumeFileIds, scheduledWorkflows]);
  const last = useMemo(() => latestSearchRun(Object.values(runs)), [runs]);
  const catalogSize = order.filter((id) => !rejected[id]).length;

  const search = useCallback(
    (opts: { query?: string; locations?: string[] } = {}) => {
      const query = (opts.query ?? readiness.query).trim();
      if (!query || readiness.blocker) return null;
      const locations = opts.locations ?? readiness.locations;
      try {
        const run = getWorkflowService().startRun({
          workflowName: `Jobs for you — ${query}`,
          stageKeys: [...SEARCH_ONLY_STAGES],
          config: {
            careerGoal: dna.careerGoal,
            automationLevel: level,
            provider: { provider: ai.activeProvider, model: ai.activeModel, billing: AI_PROVIDERS[ai.activeProvider].billing },
            sourceIds: sources.filter((s) => s.enabled).map((s) => s.id),
            searchCriteria: { query, locations, workModes: dna.workModes, minSalary: dna.minSalary },
            minMatchThreshold: 60,
            maxResults: 100,
            notify: "never",
          },
        });
        return run;
      } catch {
        return null; // a run is already going; its progress is what the screen shows
      }
    },
    [readiness, dna, level, ai, sources],
  );

  // Search on open when the results are missing, stale, or for a different search.
  useEffect(() => {
    const d = autoSearchDecision({ readiness, mode, activeRun: !!active, last, catalogSize, now: Date.now() });
    if (!d.run) return;
    const key = `${readiness.query}|${readiness.locations.join(",")}|${d.reason}|${last?.id ?? ""}`;
    if (started.has(key)) return;
    started.add(key);
    if (search()) track("jobs_auto_search", { reason: d.reason });
  }, [readiness, mode, active, last, catalogSize, search]);

  // Found nothing: search once more, wider, and say what was let go.
  useEffect(() => {
    if (mode !== "user" || active || !last || !foundNothing(last) || started.has(`widen|${last.id}`)) return;
    started.add(`widen|${last.id}`);
    const w = widenSearch(last.config.searchCriteria.query, last.config.searchCriteria.locations);
    if (!w) return;
    const run = search({ query: w.query, locations: w.locations });
    if (run) {
      widenedBecause.set(run.id, `Nothing matched “${last.config.searchCriteria.query}”${last.config.searchCriteria.locations.length ? ` in ${last.config.searchCriteria.locations.join(", ")}` : ""}, so Wonder let go of ${w.dropped}.`);
      track("jobs_search_widened", { dropped: w.dropped });
    }
  }, [mode, active, last, search]);

  return { readiness, active, last, widened: last ? widenedBecause.get(last.id) : undefined, search };
}
