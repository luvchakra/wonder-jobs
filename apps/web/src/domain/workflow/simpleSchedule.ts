import type { AutomationLevel } from "@/domain/automation/policy";
import type { StageKey } from "./stages";
import type { ProviderSnapshot, Workflow, WorkflowSchedule } from "./types";
import { nextScheduledRun } from "./schedule";

/**
 * "How often should Wonder look?" (outcome spec §22) — four plain choices that produce exactly the
 * same Workflow + WorkflowSchedule records the advanced builder does, so the scheduler, conditions,
 * silent outcomes and policy gating are untouched. Simple searches are discovery-only: preparing
 * materials on a schedule stays an explicit choice in the advanced builder.
 */
export type LookFrequency = "daily" | "weekly" | "keep_watch" | "manual";

export const LOOK_FREQUENCY_META: Record<LookFrequency, { label: string; description: string }> = {
  daily: { label: "Every day", description: "Wonder searches each morning at 8:00." },
  weekly: { label: "Every week", description: "Wonder searches every Monday at 9:00." },
  keep_watch: { label: "Keep watch", description: "Wonder searches every morning and only tells you when something worth your attention appears." },
  manual: { label: "I'll search manually", description: "Saved for one tap later — nothing runs on its own." },
};

const DISCOVERY: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];

export interface ScheduledSearchInput {
  ids: { workflow: string; schedule: string };
  now: Date;
  timezone: string;
  frequency: LookFrequency;
  /** Only notify when there are strong matches. Always true for "keep_watch". */
  onlyWhenWorthIt: boolean;
  careerGoal: string;
  query: string;
  locations: string[];
  workModes: Workflow["config"]["searchCriteria"]["workModes"];
  minSalary?: number;
  level: AutomationLevel;
  provider: ProviderSnapshot;
  sourceIds: string[];
}

export function buildScheduledSearch(input: ScheduledSearchInput): { workflow: Workflow; schedule: WorkflowSchedule } {
  const quiet = input.frequency === "keep_watch" || input.onlyWhenWorthIt;
  const cadence = input.frequency === "weekly" ? { frequency: "weekly" as const, days: [1], time: "09:00" } : { frequency: "daily" as const, days: [0, 1, 2, 3, 4, 5, 6], time: "08:00" };
  const trigger: WorkflowSchedule["trigger"] = input.frequency === "manual" ? "manual" : "schedule";
  const at = input.now.toISOString();
  const name = `${LOOK_FREQUENCY_META[input.frequency].label} — ${input.query}`;
  const description = quiet ? "Tells you only when there are strong matches." : "Tells you every time it runs.";
  const workflow: Workflow = {
    id: input.ids.workflow,
    name,
    description,
    version: 1,
    template: "simple_search",
    config: {
      careerGoal: input.careerGoal,
      automationLevel: input.frequency === "keep_watch" ? "continuous" : input.level,
      provider: input.provider,
      sourceIds: input.sourceIds,
      searchCriteria: { query: input.query, locations: input.locations, workModes: input.workModes, minSalary: input.minSalary },
      minMatchThreshold: 70,
      maxResults: 50,
      notify: quiet ? "strong_matches_only" : "always",
    },
    stageKeys: DISCOVERY,
    createdAt: at,
    updatedAt: at,
  };
  const schedule: WorkflowSchedule = {
    id: input.ids.schedule,
    workflowId: workflow.id,
    name,
    description,
    enabled: true,
    trigger,
    ...cadence,
    timezone: input.timezone,
    condition: quiet ? { key: "strong_matches", op: ">", value: 0 } : { key: "always", op: ">", value: 0 },
    actions: ["notify", "save_jobs"],
    nextRunAt: trigger === "schedule" ? nextScheduledRun({ ...cadence, timezone: input.timezone }, input.now) : undefined,
    createdAt: at,
  };
  return { workflow, schedule };
}
