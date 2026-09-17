import type { StageKey } from "@/domain/workflow/stages";
import type { WorkflowSchedule } from "@/domain/workflow/types";

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

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: "daily_discovery", name: "Daily Job Discovery", description: "Search → Deduplicate → Analyze → Match → Rank every weekday morning. Notifies you only when there are strong matches.", frequency: "weekdays", days: [1, 2, 3, 4, 5], time: "08:00", stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank"], condition: { key: "strong_matches", op: ">", value: 0 }, actions: ["notify", "save_jobs"], query: "product manager" },
  { id: "weekly_review", name: "Weekly Job Market Review", description: "A wider weekly sweep with a summary of what changed in your market.", frequency: "weekly", days: [1], time: "09:00", stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank", "learn"], condition: { key: "always", op: ">", value: 0 }, actions: ["notify"], query: "product manager OR program manager" },
  { id: "follow_up_check", name: "Application Follow-Up Check", description: "Reviews your open applications and prepares follow-up reminders. Never sends anything without you.", frequency: "daily", days: [0, 1, 2, 3, 4, 5, 6], time: "17:00", stageKeys: ["profile", "track"], condition: { key: "always", op: ">", value: 0 }, actions: ["notify"], query: "" },
  { id: "resume_optimization", name: "Resume Optimization", description: "Re-tailors materials for your strongest saved roles once a week.", frequency: "weekly", days: [6], time: "10:00", stageKeys: ["profile", "prepare", "review"], condition: { key: "always", op: ">", value: 0 }, actions: ["prepare_materials"], query: "" },
  { id: "career_progress", name: "Career Progress Review", description: "Monthly reflection: what worked, what didn't, what to change in your Career DNA.", frequency: "monthly", days: [1], time: "09:00", stageKeys: ["profile", "learn"], condition: { key: "always", op: ">", value: 0 }, actions: ["notify"], query: "" },
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

/** Next occurrence in local time (spec §19 — timezone shown; evaluation uses the browser clock in this mock backend). */
export function nextRunAt(s: Pick<WorkflowSchedule, "frequency" | "days" | "time">, from = new Date()) {
  const [h, m] = s.time.split(":").map(Number);
  for (let i = 0; i < 62; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d <= from) continue;
    const ok = s.frequency === "daily" ? true : s.frequency === "weekdays" ? d.getDay() >= 1 && d.getDay() <= 5 : s.frequency === "weekly" ? s.days.includes(d.getDay()) : d.getDate() === (s.days[0] ?? 1);
    if (ok) return d.toISOString();
  }
  return undefined;
}
