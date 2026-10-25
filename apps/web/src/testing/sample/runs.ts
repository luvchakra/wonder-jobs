/** Seeded execution history so Runs/History screens have realistic records on first load. */
import type { WorkflowRun, WorkflowStageRun } from "@/domain/workflow/types";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import { emptySummary } from "@/domain/workflow/engine";
import { JOB_SOURCES } from "./catalog";
import { SEED_DNA } from "./seed";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

function stage(runId: string, key: StageKey, start: number, durMs: number, counts: Record<string, number>, warnings: string[] = []): WorkflowStageRun {
  const total = counts.total ?? null;
  return {
    id: `stg_${runId}_${key}`,
    runId,
    key,
    status: warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
    attempt: 1,
    startedAt: new Date(start).toISOString(),
    completedAt: new Date(start + durMs).toISOString(),
    progress: { current: total ?? 1, total, unit: STAGES[key].unit ?? "items" },
    counts,
    evidence: Object.entries(counts)
      .filter(([k]) => k !== "total")
      .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v.toLocaleString("en-IN") })),
    warnings,
  };
}

function completedRun(id: string, startedAgoMs: number, opts: { discovered: number; unique: number; strong: number; trigger: "manual" | "schedule"; warnings?: string[]; silent?: boolean }): WorkflowRun {
  const start = Date.now() - startedAgoMs;
  const keys: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];
  let t = start;
  const stages: WorkflowStageRun[] = [];
  const durations: Record<string, number> = { profile: 4_000, search: 95_000, dedupe: 12_000, understand: 240_000, match: 60_000, quality: 30_000, rank: 8_000 };
  for (const k of keys) {
    const counts: Record<string, number> =
      k === "search"
        ? { discovered: opts.discovered, sources: JOB_SOURCES.length }
        : k === "dedupe"
          ? { total: opts.discovered, unique: opts.unique, duplicates: opts.discovered - opts.unique }
          : k === "understand" || k === "match" || k === "quality"
            ? { total: opts.unique, analyzed: opts.unique }
            : k === "rank"
              ? { total: opts.unique, strong_matches: opts.strong, worth_considering: Math.round(opts.unique * 0.08) }
              : { profile: 1 };
    stages.push(stage(id, k, t, durations[k], counts, k === "search" ? (opts.warnings ?? []) : []));
    t += durations[k];
  }
  const summary = emptySummary();
  summary.jobsDiscovered = opts.discovered;
  summary.jobsRetained = opts.unique;
  summary.strongMatches = opts.strong;
  summary.warnings = opts.warnings?.length ?? 0;
  return {
    id,
    workflowId: "wf_tech_leadership",
    workflowName: "Job Search — Tech Leadership (Daily)",
    workflowVersion: 3,
    trigger: opts.trigger,
    status: opts.warnings?.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
    config: {
      careerGoal: SEED_DNA.careerGoal,
      automationLevel: "guided",
      provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
      sourceIds: JOB_SOURCES.map((s) => s.id),
      searchCriteria: { query: "product manager", locations: ["Bengaluru", "Remote"], workModes: ["hybrid", "remote"], minSalary: 2_800_000 },
      minMatchThreshold: 70,
      maxResults: 50,
      notify: "strong_matches_only",
    },
    inputs: [{ key: "preferredLocations", label: "Preferred locations", value: ["Bengaluru", "Remote"], provenance: "SYSTEM_DERIVED", updatedAt: new Date(start).toISOString() }],
    overrides: [],
    stages,
    outputs: {
      search: { stageKey: "search", data: { discovered: opts.discovered }, provenance: "SYSTEM_DERIVED", producedAt: stages[1].completedAt! },
      rank: { stageKey: "rank", data: { strongMatches: opts.strong }, provenance: "AI_GENERATED", producedAt: stages[6].completedAt! },
    },
    actions: [],
    events: [
      { id: `evt_${id}_1`, at: new Date(start).toISOString(), type: "run_started", message: "Wonder started working." },
      { id: `evt_${id}_2`, at: new Date(t).toISOString(), type: "run_completed", message: opts.silent ? "Finished quietly — nothing new worth your attention." : `Finished with ${opts.strong} strong matches.` },
    ],
    createdAt: new Date(start - MIN).toISOString(),
    startedAt: new Date(start).toISOString(),
    completedAt: new Date(t).toISOString(),
    summary,
    silent: opts.silent,
  };
}

export function seedRuns(): WorkflowRun[] {
  return [
    completedRun("run_seed_today", 1 * DAY + 2 * HOUR, { discovered: 1_842, unique: 1_124, strong: 3, trigger: "schedule" }),
    completedRun("run_seed_yesterday", 2 * DAY + 2 * HOUR, { discovered: 1_790, unique: 1_098, strong: 0, trigger: "schedule", silent: true }),
    completedRun("run_seed_3", 3 * DAY + 2 * HOUR, { discovered: 1_611, unique: 1_002, strong: 2, trigger: "schedule", warnings: ["Glassdoor was temporarily unavailable. Other sources completed successfully."] }),
    completedRun("run_seed_manual", 6 * DAY + 5 * HOUR, { discovered: 1_902, unique: 1_140, strong: 5, trigger: "manual" }),
  ];
}
