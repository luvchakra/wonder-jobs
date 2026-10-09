import type { WorkflowSchedule } from "./types";
import { nextScheduledRun } from "./schedule";
import { buildScheduledSearch, type ScheduledSearchInput } from "./simpleSchedule";

/**
 * Ready-made scheduled searches. Every one is a search — the only work Wonder does on its own on a
 * schedule (server/workflow/serverExecutors.ts: search → compare → rank) — so each runs whether or not
 * the app is open. None carries a search term: it searches what the candidate asked for (a role of
 * theirs, or their Career Profile), never a canned role.
 */
export interface SearchTemplate {
  id: string;
  name: string;
  description: string;
  cadence: Pick<WorkflowSchedule, "frequency" | "days" | "time">;
  /** Tell the candidate only when there are strong matches. */
  quiet: boolean;
  workModes?: ScheduledSearchInput["workModes"];
  minMatchThreshold?: number;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const SEARCH_TEMPLATES: SearchTemplate[] = [
  { id: "weekday_shortlist", name: "Weekday shortlist", description: "Weekdays at 8:00 · tells you only when there are strong matches", cadence: { frequency: "weekdays", days: WEEKDAYS, time: "08:00" }, quiet: true },
  { id: "weekly_roundup", name: "Weekly roundup", description: "Mondays at 9:00 · tells you what it found, every week", cadence: { frequency: "weekly", days: [1], time: "09:00" }, quiet: false },
  { id: "remote_watch", name: "Remote roles only", description: "Every day at 8:00, remote roles only · tells you only when there are strong matches", cadence: { frequency: "daily", days: EVERY_DAY, time: "08:00" }, quiet: true, workModes: ["remote"] },
  { id: "top_matches", name: "Top matches only", description: "Every day at 8:00 · keeps jobs scoring 85 or more, tells you only when one is strong", cadence: { frequency: "daily", days: EVERY_DAY, time: "08:00" }, quiet: true, minMatchThreshold: 85 },
];

/** A template as the same Workflow + Schedule records every scheduled search uses. */
export function buildFromTemplate(t: SearchTemplate, input: Omit<ScheduledSearchInput, "frequency" | "onlyWhenWorthIt">) {
  const { workflow, schedule } = buildScheduledSearch({ ...input, frequency: t.cadence.frequency === "weekly" ? "weekly" : "daily", onlyWhenWorthIt: t.quiet, workModes: t.workModes ?? input.workModes });
  const name = `${t.name} — ${input.role ? `${input.role.title}: ` : ""}${input.query}`;
  return {
    workflow: { ...workflow, name, description: t.description, template: t.id, config: { ...workflow.config, minMatchThreshold: t.minMatchThreshold ?? workflow.config.minMatchThreshold } },
    schedule: { ...schedule, name, description: t.description, ...t.cadence, nextRunAt: nextScheduledRun({ ...t.cadence, timezone: input.timezone }, input.now) },
  };
}

/** The cadences offered when changing a search in place. */
export const CADENCES: { id: string; label: string; cadence: Pick<WorkflowSchedule, "frequency" | "days" | "time"> }[] = [
  { id: "weekdays", label: "Weekdays at 8:00", cadence: { frequency: "weekdays", days: WEEKDAYS, time: "08:00" } },
  { id: "daily", label: "Every day at 8:00", cadence: { frequency: "daily", days: EVERY_DAY, time: "08:00" } },
  { id: "weekly", label: "Mondays at 9:00", cadence: { frequency: "weekly", days: [1], time: "09:00" } },
];

/** Which offered cadence a schedule is on, if any. */
export const cadenceId = (s: Pick<WorkflowSchedule, "frequency" | "days" | "time">) => CADENCES.find((c) => c.cadence.frequency === s.frequency && c.cadence.time === s.time && c.cadence.days.join() === s.days.join())?.id;
