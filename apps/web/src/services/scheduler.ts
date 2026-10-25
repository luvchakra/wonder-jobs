"use client";
/**
 * Client-side scheduler for the mock backend (spec §18). While the app is
 * open it fires due schedules through the same WorkflowService a server cron
 * would call, and raises reminder notifications from real application data
 * (spec §45). One tick per minute; every decision is idempotent.
 */
import { cleanReminder, reminderLeadMs } from "@/domain/calendar/reminder";
import { conditionMet } from "@/domain/workflow/engine";
import { isDue } from "@/domain/workflow/schedule";
import { isActive } from "@/domain/workflow/status";
import { useWorkflowStore } from "@/store/workflow";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { getWorkflowService } from "@/services/workflow/service";
import { nextRunAt } from "@/services/mock/templates";
import { track } from "@/lib/analytics";

const DAY = 86_400_000;
/** How early reminders are raised; the platform's setting once it has been read (Admin → Settings → Notifications). */
let leads: Record<"interview" | "follow_up" | "thank_you", number> = { interview: 2 * DAY, follow_up: DAY, thank_you: DAY };
export function setReminderLeads(next: typeof leads) {
  leads = next;
}

/**
 * Who fires due schedules. A cron that runs at least hourly (`/api/cron/scheduled-runs`) owns it for
 * everyone and this tab stands down; a daily cron — all Vercel's Hobby plan allows — is only a backstop,
 * so the open tab keeps firing schedules at their proper time. Reported by /api/jobs/sources at boot;
 * "browser" until we hear otherwise, so a deployment without the cron still keeps its promise while a
 * tab is open. Whichever fires, `isDue` stops the other repeating a schedule that already ran today.
 */
let owner: "server" | "browser" = "browser";
export function setScheduleOwner(next: "server" | "browser") {
  owner = next;
}

export function schedulerTick(now = Date.now()) {
  fireDueSchedules(now);
  raiseReminders(now);
}

/**
 * When this tab opened. A schedule that was already due then — missed while the app was closed — is left
 * to the server's daily run: opening the app never starts a search by itself (owner, 2026-10-19). The tab
 * fires only a schedule whose time comes while it's open.
 */
const openedAt = Date.now();
export const dueWhileOpen = (nextRunAt: string | undefined, opened = openedAt) => !!nextRunAt && Date.parse(nextRunAt) >= opened;

function fireDueSchedules(now: number) {
  if (owner === "server") return;
  const ws = useWorkflowStore.getState();
  if (Object.values(ws.runs).some((r) => isActive(r.status))) return; // one run at a time
  const at = new Date(now);
  const due = Object.values(ws.schedules)
    .filter((s) => isDue(s, at) && dueWhileOpen(s.nextRunAt))
    .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
  const s = due[0];
  if (!s) return;
  const wf = ws.workflows[s.workflowId];
  const next = nextRunAt(s, new Date(now));
  if (!wf) {
    ws.upsertSchedule({ ...s, nextRunAt: next });
    return;
  }
  // Advance the schedule before starting so a failure can never re-fire in a loop.
  ws.upsertSchedule({ ...s, lastRunAt: new Date(now).toISOString(), nextRunAt: next });
  try {
    const run = getWorkflowService().startRun({ workflowId: wf.id, workflowName: wf.name, config: { ...wf.config, scheduleCondition: s.condition }, stageKeys: wf.stageKeys, trigger: "schedule" });
    track("search_schedule_triggered", { scheduleId: s.id, runId: run.id });
    useWorkflowStore.getState().upsertSchedule({ ...useWorkflowStore.getState().schedules[s.id], lastRunId: run.id });
  } catch (e) {
    useCareerStore.getState().notify({ category: "scheduled_run_failed", title: `“${s.name}” could not start`, body: e instanceof Error ? e.message : "Unknown error", href: "/app/automation/scheduled" });
  }
}

function raiseReminders(now: number) {
  const career = useCareerStore.getState();
  const jobs = useJobsStore.getState().jobs;
  for (const app of Object.values(useApplicationsStore.getState().applications)) {
    const job = jobs[app.jobId];
    for (const f of app.followUps) {
      if (f.done || career.reminded.includes(f.id)) continue;
      const dueIn = new Date(f.dueAt).getTime() - now;
      // A reminder the candidate set with push or email goes from the server (it writes the bell too).
      const own = cleanReminder(f.remind);
      if (own?.channels.some((c) => c !== "app")) continue;
      const window = reminderLeadMs(f.remind, leads[f.kind] ?? DAY);
      if (window === null || dueIn > window || dueIn < -DAY) continue;
      career.markReminded(f.id);
      career.notify(
        f.kind === "interview"
          ? { category: "interview_upcoming", title: `Interview ${dueIn < 0 ? "was due" : "coming up"} — ${job?.company ?? "employer"}`, body: `${job?.title ?? "Role"}. Wonder prepared a prep sheet.`, href: `/app/applications/${app.id}/interview` }
          : { category: "follow_up_due", title: `Follow-up ${dueIn < 0 ? "overdue" : "due soon"} — ${job?.company ?? "employer"}`, body: f.note, href: `/app/applications/${app.id}` },
      );
    }
  }
}

/** Hook up the scheduled-run → tracker link once a scheduled run finishes. */
export function reconcileScheduledRunOutcome(runId: string) {
  const ws = useWorkflowStore.getState();
  const run = ws.runs[runId];
  if (!run || run.trigger !== "schedule") return;
  const schedule = Object.values(ws.schedules).find((s) => s.lastRunId === runId);
  if (!schedule) return;
  if (conditionMet(run)) track("scheduled_run_completed", { scheduleId: schedule.id, notified: true });
}
