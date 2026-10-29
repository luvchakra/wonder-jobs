"use client";
import type { JobType } from "@/domain/jobs/jobType";
import { useCallback, useEffect, useMemo } from "react";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { autoSearchDecision, catalogSearchRun, checkedWiderQuery, jobsReadiness, mayWidenAfter, profileVocabulary, SEARCH_ONLY_STAGES, widenSearch, type Readiness } from "@/domain/jobs/readiness";
import { historyOf } from "@/domain/career/history";
import type { WorkflowRun } from "@/domain/workflow/types";
import { getWorkflowService } from "@/services/workflow/service";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { searchScope } from "@/domain/jobs/searchScope";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { useAuthStore } from "@/store/auth";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { track } from "@/lib/analytics";
import { toast } from "@/components/feedback/Toast";
import { deriveSearchIntent } from "@/services/jobs/searchIntent";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { roleSearch } from "@/domain/career/roles";

/** Searches already started from this screen in this page session, so a re-render never starts the same one twice. */
const started = new Set<string>();
/** Why a run searched more widely than the profile asked: run id → plain words. */
const widenedBecause = new Map<string, string>();
/** Searches started from this page load: only these are widened when they find nothing, never an old one found on opening. */
const startedHere = new Set<string>();

/**
 * Stops a search-only run that's going (what it found so far is kept) and resolves once it has stopped,
 * so a search the candidate asked for can start. A run doing anything beyond searching is left alone.
 */
/** An explicit search couldn't start because another run (not just a search) is going: say so, never fail silently. */
function sayBusy(started: WorkflowRun | null): WorkflowRun | null {
  const running = selectActiveRun(useWorkflowStore.getState());
  if (!started && running) toast.info("Wonder is still busy with another run", `“${running.workflowName}” finishes first — its progress is above your jobs. Then search again.`);
  return started;
}

async function stopRunningSearch(timeoutMs = 5_000): Promise<void> {
  const running = selectActiveRun(useWorkflowStore.getState());
  if (!running) return;
  if (running.stages.some((s) => !(SEARCH_ONLY_STAGES as readonly string[]).includes(s.key))) return;
  getWorkflowService().stop(running.id);
  await new Promise<void>((resolve) => {
    const done = () => {
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = useWorkflowStore.subscribe((s) => {
      if (!selectActiveRun(s)) done();
    });
    const timer = setTimeout(done, timeoutMs);
    if (!selectActiveRun(useWorkflowStore.getState())) done();
  });
}

/** A run that finished with no postings matching (not a source failure). */
import { foundNothing } from "@/domain/jobs/readiness";
export { foundNothing };

export interface JobSearch {
  readiness: Readiness;
  /** The search running now, if any. */
  active?: WorkflowRun;
  /** The latest search, running or finished. */
  last?: WorkflowRun;
  /** Why the latest search was wider than the profile asked, when it was. */
  widened?: string;
  /** Search now with the profile's own terms (or the given ones). */
  search: (opts?: SearchOptions) => WorkflowRun | null;
  /** Search every source for what the candidate typed — role, places and work mode read from their words, else the places given (the Where field), else the profile's. A search already running is stopped first: this is what they asked for. */
  searchWords: (text: string, places?: string[]) => Promise<WorkflowRun | null>;
  /** Search as one of the candidate's roles: its terms and goal, the profile's places. Stops a running search first. */
  searchAsRole: (roleId: string, places?: string[]) => Promise<WorkflowRun | null>;
  /** Search again — the profile's own search, or the given one. Stops a running search first. */
  searchNow: (opts?: SearchOptions) => Promise<WorkflowRun | null>;
  /** Stop the search running now and bring back the list as it was before it started. */
  stop: () => Promise<void>;
}

export interface SearchOptions {
  query?: string;
  locations?: string[];
  workModes?: ("remote" | "hybrid" | "onsite")[];
  careerGoal?: string;
  role?: { id: string; title: string };
  origin?: "profile" | "words";
  jobTypes?: JobType[];
  /** Skip Career Profile: only what was typed — no work modes or minimum salary from the profile either. */
  skipProfile?: boolean;
}

/** What a typed search will look for — shown before it runs, so the candidate sees what Wonder read. */
export function describeWords(text: string, fallbackLocations: string[], places?: string[]): { query: string; locations: string[]; fromWords: boolean; highPay: boolean; jobTypes: JobType[] } {
  const intent = deriveSearchIntent(text);
  return { query: intent.query, locations: intent.locations.length ? intent.locations : places ?? fallbackLocations, fromWords: intent.locations.length > 0, highPay: intent.highPay, jobTypes: intent.jobTypes };
}

/**
 * The jobs screen's engine: what blocks relevant jobs (if anything), and searching without a button —
 * on open when the results are missing, stale or for a different search, and once more, wider, when a
 * search found nothing. Search-only runs: finding, matching and ranking; applications are prepared
 * later, from a job, by the candidate.
 */
export function useJobSearch(opts: { auto?: boolean } = {}): JobSearch {
  const auto = opts.auto ?? true;
  const dna = useCareerStore((s) => s.dna);
  const roles = useCareerStore((s) => s.roles ?? []);
  const baseResume = useCareerStore((s) => s.baseResume);
  const sources = useJobsStore((s) => s.sources);
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
  const searchedFor = useJobsStore((s) => s.searchedFor);
  const last = useMemo(() => catalogSearchRun(Object.values(runs), searchedFor), [runs, searchedFor]);

  const search = useCallback(
    (opts: SearchOptions = {}) => {
      const query = (opts.query ?? readiness.query).trim();
      // Typed words and roles carry their own role, so only a profile search waits on the profile's blockers.
      if (!query || (readiness.blocker && (opts.origin ?? "profile") === "profile" && !opts.role)) return null;
      // Refine's places, work modes and pay first; the Career Profile's only for what Refine leaves open.
      const { locations, workModes, minSalary } = searchScope(useJobsStore.getState().filters, { locations: readiness.locations, workModes: dna.workModes, minSalary: dna.minSalary }, opts);
      // Job types asked for (words like "part time", or the pills under the search box): the sources that list them go first.
      const jobTypes = opts.jobTypes?.length ? opts.jobTypes : (useJobsStore.getState().filters.jobTypes ?? []);
      try {
        const run = getWorkflowService().startRun({
          workflowName: opts.role ? `Search as ${opts.role.title}` : `Jobs for you — ${query}`,
          stageKeys: [...SEARCH_ONLY_STAGES],
          config: {
            careerGoal: opts.careerGoal ?? dna.careerGoal,
            automationLevel: level,
            provider: { provider: ai.activeProvider, model: ai.activeModel, billing: AI_PROVIDERS[ai.activeProvider].billing },
            sourceIds: sources.filter((s) => s.enabled).map((s) => s.id),
            searchCriteria: { query, locations, workModes, ...(minSalary != null ? { minSalary } : {}), ...(jobTypes.length ? { jobTypes } : {}) },
            minMatchThreshold: 60,
            maxResults: 100,
            notify: "never",
            origin: opts.origin ?? "profile",
            ...(opts.role ? { role: opts.role } : {}),
          },
        });
        startedHere.add(run.id);
        // The list as it is now, for Stop (the search starts replacing it as its first jobs arrive).
        useJobsStore.getState().keepBeforeRun(run.id);
        return run;
      } catch {
        return null; // a run is already going; its progress is what the screen shows
      }
    },
    [readiness, dna, level, ai, sources],
  );

  const searchWords = useCallback(
    async (text: string, places?: string[]) => {
      const intent = deriveSearchIntent(text);
      // Skip Career Profile: only the typed words — no role, places, work modes or salary from the profile.
      const skip = !!useJobsStore.getState().filters.skipProfile;
      // Only places or pay typed ("Singapore", "high paying jobs"): the profile's own roles, there — unless skipped.
      const query = intent.query || (!skip && (intent.locations.length || intent.highPay || intent.jobTypes.length) ? readiness.query : "");
      if (!query) return null;
      // "High paying": the best-paid first (jobs without a stated salary go last).
      if (intent.highPay) useJobsStore.getState().setSort("salary");
      // "Part time", "freelance": only those job types (Refine shows and clears it).
      if (intent.jobTypes.length) useJobsStore.getState().setFilters({ jobTypes: intent.jobTypes });
      await stopRunningSearch();
      track("find_started", { derivedFromWords: true, locations: intent.locations.length, sources: sources.filter((s) => s.enabled).length });
      // Places typed into a search are learned (domain/career/learning.ts); the profile's own are skipped there.
      const typedPlaces = intent.locations.length ? intent.locations : places ?? [];
      if (typedPlaces.length) useCareerStore.getState().recordSearch(typedPlaces);
      // Places typed in the words win; then the places given (Refine's Location), else the mode's own default.
      const locations = intent.locations.length ? intent.locations : (places ?? (skip ? (useJobsStore.getState().filters.locations ?? []) : undefined));
      return sayBusy(search({ query, locations, workModes: intent.workModes.length ? intent.workModes : undefined, careerGoal: text.trim(), origin: "words", jobTypes: intent.jobTypes, skipProfile: skip }));
    },
    [search, sources, readiness.query],
  );

  const searchAsRole = useCallback(
    async (roleId: string, places?: string[]) => {
      const role = roles.find((r) => r.id === roleId);
      if (!role) return null;
      const { query, careerGoal } = roleSearch(role, defaultSearchQuery);
      await stopRunningSearch();
      return sayBusy(search({ query, careerGoal, role: { id: role.id, title: role.title }, origin: "words", ...(places ? { locations: places } : {}) }));
    },
    [roles, search],
  );

  // Search on open only for an account that has never searched (autoSearchDecision) — unless the screen
  // was opened to search for something specific, which then goes first.
  useEffect(() => {
    if (!auto) return;
    const d = autoSearchDecision({ readiness, mode, activeRun: !!active, last });
    if (!d.run) return;
    const key = `${readiness.query}|${readiness.locations.join(",")}|${d.reason}|${last?.id ?? ""}`;
    if (started.has(key)) return;
    started.add(key);
    if (search()) track("jobs_auto_search", { reason: d.reason });
  }, [auto, readiness, mode, active, last, search]);

  // Found nothing: search once more, wider, and say what was let go. AI first proposes a more common
  // title for the same role (every word the candidate's own, checked here and on the server); failing
  // that — or after an AI-widened search also found nothing — the rules widen as before.
  useEffect(() => {
    if (mode !== "user" || active || !last || !startedHere.has(last.id) || !foundNothing(last) || started.has(`widen|${last.id}`)) return;
    started.add(`widen|${last.id}`);
    const { query, locations } = last.config.searchCriteria;
    const where = locations.length ? ` in ${locations.join(", ")}` : "";
    const base = { careerGoal: last.config.careerGoal, origin: last.config.origin, role: last.config.role };
    // The AI's answer comes back later: by then the candidate may have searched again, and theirs wins.
    const stillWanted = () => {
      const w = useWorkflowStore.getState();
      return mayWidenAfter(Object.values(w.runs), last.id, !!selectActiveRun(w));
    };
    const byRules = () => {
      if (!stillWanted()) return;
      const w = widenSearch(query, locations);
      if (!w) return;
      const run = search({ ...base, query: w.query, locations: w.locations });
      if (run) {
        widenedBecause.set(run.id, `Nothing matched “${query}”${where}, so Wonder let go of ${w.dropped}.`);
        track("jobs_search_widened", { dropped: w.dropped });
      }
    };
    if (widenedBecause.has(last.id)) return byRules();
    const profile = { roleWanted: dna.careerGoal.slice(0, 200), headline: dna.headline.slice(0, 200), titles: historyOf(dna).experience.slice(0, 10).map((e) => e.title.slice(0, 120)), skills: dna.skills.slice(0, 25).map((k) => k.name.slice(0, 80)) };
    fetch("/api/ai/widen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: query.slice(0, 160), profile }) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d: { query?: string | null } | null) => {
        if (!stillWanted()) return;
        const wider = checkedWiderQuery(d?.query, query, profileVocabulary(dna, query));
        if (!wider) return byRules();
        const run = search({ ...base, query: wider, locations });
        if (!run) return;
        widenedBecause.set(run.id, `Nothing matched “${query}”${where}, so Wonder searched for “${wider}” — a title AI picked from your Career Profile.`);
        track("jobs_search_widened", { dropped: "ai_title" });
      });
  }, [mode, active, last, search, dna]);

  const searchNow = useCallback(
    async (opts?: SearchOptions) => {
      await stopRunningSearch();
      return sayBusy(search(opts));
    },
    [search],
  );

  const stop = useCallback(async () => {
    const running = selectActiveRun(useWorkflowStore.getState());
    if (!running) return;
    await stopRunningSearch();
    useJobsStore.getState().restoreBeforeRun(running.id);
    track("find_stopped", {});
  }, []);

  return { readiness, active, last, widened: last ? widenedBecause.get(last.id) : undefined, search, searchWords, searchAsRole, searchNow, stop };
}
