import type { StageKey } from "@/domain/workflow/stages";
import type { WorkflowSchedule } from "@/domain/workflow/types";

/** Re-exported so callers keep one import for everything schedule-shaped; the logic lives in the domain. */
export { nextScheduledRun as nextRunAt } from "@/domain/workflow/schedule";

/** `query` is empty on every template: the search comes from the candidate (their words or Career
 *  Profile), never a canned role — see ScheduleBuilder. */
export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  frequency: WorkflowSchedule["frequency"];
  days: number[];
  time: string;
  stageKeys: StageKey[];
  condition: WorkflowSchedule["condition"];
  actions: WorkflowSchedule["actions"];
  query: string;
}

/** Starting points for the advanced builder. Only searches run on a schedule (server/workflow/serverExecutors.ts); the
 *  ready-made searches the candidate adds in one tap are in domain/workflow/searchTemplates.ts. */
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: "daily_discovery", name: "Daily Job Discovery", description: "Search → Deduplicate → Analyze → Match → Rank every weekday morning. Notifies you only when there are strong matches.", frequency: "weekdays", days: [1, 2, 3, 4, 5], time: "08:00", stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank"], condition: { key: "strong_matches", op: ">", value: 0 }, actions: ["notify", "save_jobs"], query: "" },
  { id: "weekly_review", name: "Weekly Job Market Review", description: "A wider weekly sweep that tells you what it found, every week.", frequency: "weekly", days: [1], time: "09:00", stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank"], condition: { key: "always", op: ">", value: 0 }, actions: ["notify"], query: "" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeSchedule(s: Pick<WorkflowSchedule, "frequency" | "days" | "time" | "timezone">) {
  const [h, m] = s.time.split(":").map(Number);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  const time = t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const when = s.frequency === "daily" ? "Every day" : s.frequency === "weekdays" ? "Every weekday" : s.frequency === "weekly" ? `Every ${s.days.map((d) => DAY_NAMES[d]).join(", ")}` : `Monthly on day ${s.days[0] ?? 1}`;
  return `${when} at ${time}`;
}
