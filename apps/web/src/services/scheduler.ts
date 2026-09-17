"use client";
/**
 * Client-side scheduler for the mock backend (spec §18). While the app is
 * open it fires due schedules through the same WorkflowService a server cron
 * would call, and raises reminder notifications from real application data
 * (spec §45). One tick per minute; every decision is idempotent.
 */
import { conditionMet } from "@/domain/workflow/engine";
import { isActive } from "@/domain/workflow/status";
import { useWorkflowStore } from "@/store/workflow";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { getWorkflowService } from "@/services/workflow/service";
import { nextRunAt } from "@/services/mock/templates";
import { track } from "@/lib/analytics";

const DAY = 86_400_000;

export function schedulerTick(now = Date.now()) {
  fireDueSchedules(now);
  raiseReminders(now);
}

function fireDueSchedules(now: number) {
  const ws = useWorkflowStore.getState();
  if (Object.values(ws.runs).some((r) => isActive(r.status))) return; // one run at a time
  const due = Object.values(ws.schedules)
    .filter((s) => s.enabled && s.trigger === "schedule" && s.nextRunAt && new Date(s.nextRunAt).getTime() <= now)
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
      const window = f.kind === "interview" ? 2 * DAY : DAY;
      if (dueIn > window || dueIn < -DAY) continue;
      career.markReminded(f.id);
      career.notify(
        f.kind === "interview"
          ? { category: "interview_upcoming", title: `Interview ${dueIn < 0 ? "was due" : "coming up"} — ${job?.company ?? "employer"}`, body: `${job?.title ?? "Role"}. Wonder prepared a prep sheet.`, href: "/app/interview-prep" }
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
