/**
 * Scheduler settings and the recent cron runs, kept under the platform tenant in the state store
 * (like JobsLake API pricing). Only platform admins write the settings; only the crons and an admin's
 * Run now write runs. Neither holds a candidate's data — runs carry counts, never tenant ids.
 */
import { MAX_CRON_RUNS, SCHEDULER_DEFAULTS, cleanScheduler, type CronRun, type SchedulerSettings } from "@/domain/scheduler/settings";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

const SETTINGS = "wj.scheduler";
const RUNS = "wj.cronruns";

/** The settings in force; the defaults when none are saved or the store can't be read (the crons keep working). */
export async function loadScheduler(): Promise<SchedulerSettings> {
  try {
    const doc = await stateStore.get(PLATFORM_TENANT, SETTINGS);
    return cleanScheduler(doc?.state);
  } catch (e) {
    console.error(`[scheduler] settings unreadable, using defaults: ${e instanceof Error ? e.message : "unknown"}`);
    return SCHEDULER_DEFAULTS;
  }
}

export async function saveScheduler(raw: unknown, actor: string): Promise<SchedulerSettings> {
  const value: SchedulerSettings = { ...cleanScheduler(raw), updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, SETTINGS, value);
  return value;
}

export async function listCronRuns(): Promise<CronRun[]> {
  const doc = await stateStore.get(PLATFORM_TENANT, RUNS).catch(() => undefined);
  const runs = (doc?.state as { runs?: CronRun[] } | undefined)?.runs;
  return Array.isArray(runs) ? runs : [];
}

/** Adds a run to the log (newest first, the last MAX_CRON_RUNS kept). Never throws: a log write must not fail a cron. */
export async function recordCronRun(run: CronRun): Promise<void> {
  try {
    const runs = [{ ...run, summary: run.summary.slice(0, 300) }, ...(await listCronRuns())].slice(0, MAX_CRON_RUNS);
    await stateStore.put(PLATFORM_TENANT, RUNS, { runs });
  } catch (e) {
    console.warn(`[scheduler] could not record the ${run.job} run: ${e instanceof Error ? e.message : "unknown"}`);
  }
}
