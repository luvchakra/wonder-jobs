/**
 * The gateway's one scheduled job (Scheduler → Gateway collection), run by the cron (hourly through GitHub Actions,
 * daily by Vercel) and by an admin's Run now: the same code either way, so there is one job, not two.
 *  1. When the Scheduler says so, queues the gateway sources waiting on Setup to-do (added, not live; not ones that just
 *     failed) as a Setup job. Adding a new catalogue source stays an admin's press.
 *  2. Collects the live sources that are due.
 *  3. Hands an unfinished Setup job on to its own call; that job refreshes every module when it finishes.
 *  4. Otherwise refreshes Find once (warm.ts): every module on Run now; on the schedule, the modules this run collected
 *     anything for, and none when it collected nothing.
 */
import { loadScheduler, recordCronRun } from "@/server/scheduler/store";
import { refreshGatewayListings } from "@/server/jobslake/warm";
import { setupTodo } from "@/server/jobslake/setup";
import { hostedGateway } from "./index";
import { gatewaySourceModules } from "./admin";
import { handOnSetupJob, jobRunning, readSetupJob, startSetupJob } from "./setupJob";

export interface GatewayRunResult {
  ok: boolean;
  skipped?: string;
  summary: string;
  outcomes?: { sourceId: string; ok: boolean; code?: string; valid?: number }[];
  queued?: number;
  refreshed?: Record<string, number>;
}

/** Waiting gateway sources to test and activate: added and paused, not tried and failed in the last day. */
async function waitingItems() {
  const [todo, last] = await Promise.all([setupTodo(), readSetupJob()]);
  const recent = last?.finishedAt && Date.now() - Date.parse(last.finishedAt) < 86_400_000 ? last : null;
  const failedLately = new Set(recent?.items.filter((i) => i.status === "failed").map((i) => i.id) ?? []);
  return todo.items.filter((i) => i.run?.kind === "activate" && !failedLately.has(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
}

export async function runGatewayCollection(trigger: "cron" | "admin", origin: string): Promise<GatewayRunResult> {
  const startedAt = new Date().toISOString();
  const hosted = hostedGateway();
  if (!hosted) return { ok: true, skipped: "gateway not configured", summary: "Gateway not configured" };
  const settings = await loadScheduler();

  let queued = 0;
  if (settings.gateway.activateWaiting && !jobRunning(await readSetupJob())) {
    const items = await waitingItems().catch(() => []);
    if (items.length) {
      const r = await startSetupJob(items, trigger === "admin" ? "Scheduler (Run now)" : "Scheduler", new Date(), "scheduler");
      if (r.ok) queued = r.job.items.length;
    }
  }

  const outcomes = (await hosted.gateway.collectDue()).map((o) => ({ sourceId: o.sourceId, ok: o.ok, code: o.code, valid: o.valid }));
  const setupRunning = jobRunning(await readSetupJob());
  if (setupRunning) await handOnSetupJob(origin);

  // One refresh per run: a running Setup job refreshes every module itself when it finishes.
  let refreshed: Record<string, number> | undefined;
  const collected = outcomes.filter((o) => o.ok && (o.valid ?? 0) > 0);
  if (!setupRunning && trigger === "admin") refreshed = (await refreshGatewayListings().catch(() => null))?.stored;
  else if (!setupRunning && collected.length) {
    const modules = (await Promise.all(collected.map((o) => gatewaySourceModules(o.sourceId)))).flat();
    if (modules.length) refreshed = (await refreshGatewayListings(modules).catch(() => null))?.stored;
  }

  const failed = outcomes.filter((o) => !o.ok).length;
  const parts = [`${outcomes.length} due · ${collected.length} collected${failed ? ` · ${failed} failed` : ""}`];
  if (queued) parts.push(`${queued} waiting sources queued to test & activate`);
  else if (setupRunning) parts.push("Setup job continuing");
  if (refreshed) parts.push(`Find refreshed: ${Object.entries(refreshed).map(([m, n]) => `${n} ${m}`).join(", ")}`);
  const summary = parts.join(" · ");
  await recordCronRun({ job: "gateway-collect", trigger, startedAt, finishedAt: new Date().toISOString(), outcome: failed && !collected.length ? "failed" : "ok", summary });
  return { ok: !failed, summary, outcomes, queued, ...(refreshed ? { refreshed } : {}) };
}
