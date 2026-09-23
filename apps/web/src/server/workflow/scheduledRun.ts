/**
 * Fires a tenant's due scheduled runs on the server (spec §18).
 *
 * The browser's scheduler (`services/scheduler.ts`) only ticks while a tab is open, which makes
 * "every weekday at 08:00" a promise the product could not keep. This is the same decision sequence,
 * made by the cron against the tenant's persisted state, so a schedule fires whether or not anyone is
 * looking. Every step is idempotent: the schedule is advanced *before* the run starts, so a crash or a
 * timeout can never leave a run re-firing in a loop.
 */
import { WorkflowEngine, conditionMet } from "@/domain/workflow/engine";
import { isDue, nextScheduledRun } from "@/domain/workflow/schedule";
import { isActive } from "@/domain/workflow/status";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import type { Workflow, WorkflowRun, WorkflowSchedule } from "@/domain/workflow/types";
import type { Notification } from "@/domain/career/types";
import { newId } from "@/lib/ids";
import { notifyTenant, type PushPayload } from "@/server/push/subscriptions";
import { loadTenantSnapshot, saveTenantDocs, type TenantSnapshot } from "./snapshot";
import { createServerExecutors, isServerStage } from "./serverExecutors";

/** Matches the client store's history cap so the two never disagree about what a tenant keeps. */
const RUN_HISTORY = 40;
const NOTIFICATION_CAP = 50;
const ACTIVITY_CAP = 30;

export interface ScheduledRunReport {
  tenantId: string;
  scheduleId: string;
  scheduleName: string;
  outcome: "completed" | "silent" | "failed" | "skipped";
  reason?: string;
  runId?: string;
  strongMatches?: number;
  notified?: boolean;
}

export interface RunDueOptions {
  now?: Date;
  /** Hard ceiling for one tenant's run, so a slow source can't eat the whole cron invocation. */
  timeoutMs?: number;
}

/**
 * Fires at most one due schedule for this tenant — the same "one run at a time" rule the app enforces,
 * for the same reason: two concurrent runs would fight over the jobs catalog. The next tick takes the next.
 */
export async function runDueSchedules(tenantId: string, opts: RunDueOptions = {}): Promise<ScheduledRunReport | undefined> {
  const now = opts.now ?? new Date();
  const snapshot = await loadTenantSnapshot(tenantId);

  const due = Object.values(snapshot.workflow.schedules)
    .filter((s) => isDue(s, now))
    .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
  const schedule = due[0];
  if (!schedule) return undefined;

  const base = { tenantId, scheduleId: schedule.id, scheduleName: schedule.name };
  const workflow = snapshot.workflow.workflows[schedule.workflowId];

  // Advance first, always: whatever happens next, this schedule has had its turn.
  const advanced: WorkflowSchedule = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: nextScheduledRun(schedule, now) };
  snapshot.workflow.schedules[schedule.id] = advanced;

  if (Object.values(snapshot.workflow.runs).some((r) => isActive(r.status))) {
    // A run the candidate started (or a previous tick started) is still going. Advancing the schedule is
    // deliberate: skipping one occurrence is better than two runs writing the same catalog.
    await saveTenantDocs(snapshot, { workflow: true });
    return { ...base, outcome: "skipped", reason: "another run is already active" };
  }
  if (!workflow) {
    await saveTenantDocs(snapshot, { workflow: true });
    return { ...base, outcome: "skipped", reason: "the schedule's workflow no longer exists" };
  }

  const stageKeys = workflow.stageKeys.filter(isServerStage);
  const deferred = workflow.stageKeys.filter((k) => !isServerStage(k));
  if (!stageKeys.includes("search")) {
    // Schedules whose work is all review-and-consent stages (preparing materials, submitting) have nothing
    // the server may do alone. They stay the app's job; firing an empty run would only add noise.
    await saveTenantDocs(snapshot, { workflow: true });
    return { ...base, outcome: "skipped", reason: "this schedule's stages need you in the app" };
  }
  await saveTenantDocs(snapshot, { workflow: true });

  const outcome = { jobsTouched: false };
  const engine = new WorkflowEngine({
    executors: createServerExecutors(snapshot, outcome),
    getPolicy: () => snapshot.automation.policy,
    // No sleeping for effect: a cron has a wall-clock budget and no progress bar to pace.
    sleep: async () => {},
  });
  const run = engine.createRun({
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowVersion: workflow.version,
    trigger: "schedule",
    config: { ...workflow.config, scheduleCondition: schedule.condition },
    stageKeys,
  });

  try {
    await withTimeout(engine.start(run.id), opts.timeoutMs);
  } catch (e) {
    // A timeout leaves the engine mid-stage; stop it so the persisted run reads STOPPED, not RUNNING.
    if (!isActive(run.status)) throw e;
    engine.stop(run.id);
    run.error = { category: "recoverable", message: e instanceof Error ? e.message : String(e), actions: ["retry", "stop"] };
  }

  const finished = engine.getRun(run.id) ?? run;
  recordRun(snapshot, finished);
  snapshot.workflow.schedules[schedule.id] = { ...snapshot.workflow.schedules[schedule.id], lastRunId: finished.id };

  const failed = finished.status === "FAILED" || finished.status === "STOPPED";
  const notice = failed ? notifyFailure(snapshot, advanced, finished) : notifySuccess(snapshot, advanced, workflow, finished, deferred);
  await saveTenantDocs(snapshot, { workflow: true, career: true, jobs: outcome.jobsTouched });
  // The in-app notification is the record and is already saved; the push is only the nudge, so it goes
  // last and can never cost us the run's results.
  if (notice) await notifyTenant(tenantId, notice);

  return {
    ...base,
    outcome: failed ? "failed" : finished.silent ? "silent" : "completed",
    reason: failed ? (finished.error?.message ?? "the run did not finish") : undefined,
    runId: finished.id,
    strongMatches: finished.summary.strongMatches,
    notified: Boolean(notice),
  };
}

function withTimeout<T>(p: Promise<T>, ms?: number): Promise<T> {
  if (!ms) return p;
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`The run exceeded its ${Math.round(ms / 1000)}s budget and was stopped. Completed stages are saved.`)), ms).unref?.())]) as Promise<T>;
}

/** Same bounded history as the client store: the most recent runs, never dropping an active one. */
function recordRun(snapshot: TenantSnapshot, run: WorkflowRun) {
  const runs = { ...snapshot.workflow.runs, [run.id]: run };
  const ids = Object.values(runs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((r, i) => i < RUN_HISTORY || isActive(r.status))
    .map((r) => r.id);
  snapshot.workflow.runs = Object.fromEntries(ids.map((id) => [id, runs[id]]));
}

function pushNotification(snapshot: TenantSnapshot, n: Omit<Notification, "id" | "at" | "read">): PushPayload {
  snapshot.career.notifications = [{ ...n, id: newId("ntf"), at: new Date().toISOString(), read: false }, ...snapshot.career.notifications].slice(0, NOTIFICATION_CAP);
  return { title: n.title, body: n.body, url: n.href, tag: n.category };
}

function notifyFailure(snapshot: TenantSnapshot, schedule: WorkflowSchedule, run: WorkflowRun): PushPayload {
  return pushNotification(snapshot, {
    category: "scheduled_run_failed",
    title: `“${schedule.name}” didn't finish`,
    body: run.error?.message ?? "The scheduled run stopped before it completed. Nothing was lost — open it to see how far it got.",
    href: `/app/runs/${run.id}`,
  });
}

function notifySuccess(snapshot: TenantSnapshot, schedule: WorkflowSchedule, workflow: Workflow, run: WorkflowRun, deferred: StageKey[]): PushPayload | undefined {
  snapshot.career.activity = [
    { id: newId("act"), at: new Date().toISOString(), kind: "run_completed" as const, title: `“${schedule.name}” ran`, subtitle: `${run.summary.jobsRetained.toLocaleString("en-IN")} opportunities · ${run.summary.strongMatches} strong`, href: `/app/runs/${run.id}` },
    ...snapshot.career.activity,
  ].slice(0, ACTIVITY_CAP);

  // Silence is a valid outcome (spec §18): a schedule that found nothing worth the candidate's attention
  // says nothing at all. The run is still there in history if they go looking.
  const wantsNotice = schedule.actions.includes("notify") && workflow.config.notify !== "never";
  if (!wantsNotice || run.silent || !conditionMet(run)) return undefined;
  if (workflow.config.notify === "strong_matches_only" && run.summary.strongMatches === 0) return undefined;

  const strong = run.summary.strongMatches;
  const tail = deferred.length ? ` Open Wonder to ${deferred.map((k) => STAGES[k].name.toLowerCase()).join(", ")}.` : "";
  return pushNotification(snapshot, {
    category: strong > 0 ? "strong_opportunity" : "workflow_completed",
    title: strong > 0 ? `${strong} strong match${strong === 1 ? "" : "es"} from “${schedule.name}”` : `“${schedule.name}” finished`,
    body: `${run.summary.jobsRetained.toLocaleString("en-IN")} opportunities reviewed, ${run.summary.strongMatches} worth your time.${tail}`,
    href: strong > 0 ? "/app/jobs?fit=strong" : `/app/runs/${run.id}`,
  });
}
