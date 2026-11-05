/**
 * The gateway's one scheduled job (Scheduler → Gateway collection), run by the cron (hourly through GitHub Actions,
 * daily by Vercel) and by an admin's Run now: the same code either way, so there is one job, not two.
 *  1. When the Scheduler says so, queues the gateway sources waiting on Sources → Import (added, not live; not ones that just
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
import { lastScheduledRunWithin, listImportRuns, recentFailures, recordImportRun, RETRY_AFTER_MS, type ImportRun } from "./importRuns";
import { sendImportEmail } from "./importEmail";
import { MIN_GAP_MINUTES, SOURCE_FLOOR_MINUTES } from "@/domain/gateway/budget";

/** Collection's share of one scheduled call (Vercel stops it at 60 s); the rest is the Find refresh and the run's record. */
export const COLLECT_BUDGET_MS = 25_000;
/** How long Find may go without a refresh before a scheduled run refreshes every module. */
export const REFRESH_STALE_MS = 6 * 60 * 60_000;

/** When Find was last refreshed from the gateway: the latest recorded run that stored listings (0 when none). */
async function lastRefreshAt(): Promise<number> {
  const runs = await listImportRuns();
  const done = runs.filter((r) => r.stored && r.finishedAt).map((r) => Date.parse(r.finishedAt as string));
  return done.length ? Math.max(...done) : 0;
}

export interface GatewayRunResult {
  ok: boolean;
  skipped?: string;
  summary: string;
  outcomes?: { sourceId: string; ok: boolean; code?: string; valid?: number }[];
  queued?: number;
  refreshed?: Record<string, number>;
}

/**
 * Sources that didn't go live in the last day: from the run records, and from the last import job itself (runs recorded
 * before 2026-11-02 carry no ids).
 */
export async function failedLately(): Promise<Map<string, { at: string; step?: string; message?: string }>> {
  const [runs, job] = await Promise.all([recentFailures(), readSetupJob().catch(() => null)]);
  const out = new Map(runs);
  const at = job?.finishedAt ?? job?.createdAt;
  if (job && at && Date.now() - Date.parse(at) < RETRY_AFTER_MS)
    for (const i of job.items) if (i.status === "failed" && !out.has(i.id)) out.set(i.id, { at: i.finishedAt ?? at, ...(i.step ? { step: i.step } : {}), ...(i.message ? { message: i.message } : {}) });
  return out;
}

/** Waiting gateway sources to test and activate: added and paused, not tried and failed in the last day, not in a paused module. */
async function waitingItems(pausedModules: string[], dismissed: string[] = []) {
  const [todo, failed] = await Promise.all([setupTodo(), failedLately()]);
  const skip = new Set([...failed.keys(), ...dismissed]);
  return todo.items.filter((i) => i.run?.kind === "activate" && !skip.has(i.id) && !pausedModules.includes(i.module)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
}

export async function runGatewayCollection(trigger: "cron" | "admin", origin: string, notify: (run: ImportRun, earlier: ImportRun[]) => Promise<unknown> = sendImportEmail): Promise<GatewayRunResult> {
  const startedAt = new Date().toISOString();
  const hosted = hostedGateway();
  if (!hosted) return { ok: true, skipped: "gateway not configured", summary: "Gateway not configured" };
  const settings = await loadScheduler();

  let queued = 0;
  if (settings.gateway.activateWaiting && !jobRunning(await readSetupJob())) {
    const items = await waitingItems(settings.gateway.pausedModules, settings.gateway.dismissed).catch(() => []);
    if (items.length) {
      const r = await startSetupJob(items, trigger === "admin" ? "Scheduler (Run now)" : "Scheduler", new Date(), "scheduler");
      if (r.ok) queued = r.job.items.length;
    }
  }

  // A scheduled trigger right after the last one only carries a running import on (domain/gateway/budget.ts).
  // Find not refreshed for REFRESH_STALE_MS (a run cut short, or nothing new collected since) refreshes every module, so
  // listings the gateway already re-read reach Find, even when the last scheduled run was a moment ago.
  const findStale = async () => trigger === "cron" && (await lastRefreshAt().catch(() => 0)) < Date.now() - REFRESH_STALE_MS;
  if (trigger === "cron" && (await lastScheduledRunWithin(MIN_GAP_MINUTES))) {
    const running = jobRunning(await readSetupJob());
    if (running) await handOnSetupJob(origin);
    if (!running && (await findStale())) {
      const stored = (await refreshGatewayListings().catch(() => null))?.stored;
      if (stored) {
        const summary = `Ran recently · Find refreshed: ${Object.entries(stored).map(([m, n]) => `${n} ${m}`).join(", ")}`;
        const finishedAt = new Date().toISOString();
        await recordImportRun({ id: `hourly_${Date.parse(startedAt).toString(36)}`, kind: "hourly", trigger: "cron", startedAt, finishedAt, items: [], stored, summary });
        return { ok: true, skipped: "ran recently", summary, refreshed: stored };
      }
    }
    return { ok: true, skipped: "ran recently", summary: running ? "Ran recently · Setup job continuing" : "Ran recently: nothing to do" };
  }
  const floor = trigger === "cron" ? SOURCE_FLOOR_MINUTES : 0;
  // Collection takes at most COLLECT_BUDGET_MS of the call (each source only the time left), so the Find refresh and the
  // run's record still fit in Vercel's 60 s: runs that ran out of time (504) never refreshed Find (owner, 2026-11-04:
  // descriptions stayed flattened after the fix).
  const outcomes = (await hosted.gateway.collectDue(COLLECT_BUDGET_MS, settings.gateway.pausedModules, floor)).map((o) => ({ sourceId: o.sourceId, ok: o.ok, code: o.code, valid: o.valid }));
  const setupRunning = jobRunning(await readSetupJob());
  if (setupRunning) await handOnSetupJob(origin);

  // One refresh per run: a running Setup job refreshes every module itself when it finishes.
  let refreshed: Record<string, number> | undefined;
  const collected = outcomes.filter((o) => o.ok && (o.valid ?? 0) > 0);
  const stale = !setupRunning && (await findStale());
  if (!setupRunning && (trigger === "admin" || stale)) refreshed = (await refreshGatewayListings().catch(() => null))?.stored;
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
  const finishedAt = new Date().toISOString();
  await recordCronRun({ job: "gateway-collect", trigger, startedAt, finishedAt, outcome: failed && !collected.length ? "failed" : "ok", summary });
  // The run's own record, with each source's outcome (Sources → Import → Runs).
  const names = await hosted.store.read((s) => new Map((s.sources as { id: string; attribution?: string }[]).map((x) => [x.id, String(x.attribution ?? x.id)]))).catch(() => new Map<string, string>());
  const record: ImportRun = {
    id: `hourly_${Date.parse(startedAt).toString(36)}`,
    kind: "hourly",
    trigger: trigger === "admin" ? "admin" : "cron",
    startedAt,
    finishedAt,
    items: outcomes.filter((o) => o.code !== "DEFERRED").map((o) => ({ name: names.get(o.sourceId) ?? o.sourceId, status: o.ok ? "collected" : "failed", ...(o.valid != null ? { valid: o.valid } : {}), ...(o.ok ? {} : { message: o.code ?? "failed" }) })),
    ...(refreshed ? { stored: refreshed } : {}),
    summary,
  };
  const earlier = await listImportRuns().catch(() => []);
  await recordImportRun(record);
  // The admins hear about every collection that collected or refreshed anything, like an import (importEmail.ts).
  await notify(record, earlier);
  return { ok: !failed, summary, outcomes, queued, ...(refreshed ? { refreshed } : {}) };
}

/**
 * Import now (Sources → Import): the one press that runs the whole pipeline. Waiting sources (added, not live:
 * catalogue entries to add, gateway sources to test and activate) are queued as a Setup job, which refreshes every
 * module's Find when it finishes; with nothing waiting, the collection runs now and refreshes every module itself.
 * Either way the work runs on the server after the answer; the page shows how far it got.
 */
export async function startImport(by: string, origin: string): Promise<{ ok: true; queued: number; skipped: number } | { ok: false; message: string }> {
  if (!hostedGateway()) return { ok: false, message: "The gateway isn't configured on this deployment." };
  if (jobRunning(await readSetupJob())) return { ok: false, message: "An import is already running on the server." };
  const [{ pausedModules, dismissed }, failed] = await Promise.all([loadScheduler().then((s) => s.gateway), failedLately()]);
  // Sources that didn't go live in the last day (a site that refuses us, a test that found nothing) are left out:
  // retrying every one held a whole import up. Each still has its own Test & activate on its module's card.
  const waiting = (await setupTodo()).items.filter((i) => i.run && !pausedModules.includes(i.module) && !dismissed.includes(i.id));
  const items = waiting.filter((i) => !failed.has(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
  const skipped = waiting.length - items.length;
  if (items.length) {
    const r = await startSetupJob(items, by);
    if (!r.ok) return { ok: false, message: r.message };
    // The job's own call does the work and hands the rest on, and refreshes every module's Find when it's done.
    await handOnSetupJob(origin);
    return { ok: true, queued: r.job.items.length, skipped };
  }
  // Nothing new to set up: collect what's due and refresh every module's Find now.
  await runGatewayCollection("admin", origin);
  return { ok: true, queued: 0, skipped };
}

/**
 * Import this module now (Sources → Import, on a module's card): its waiting sources are set up and its live gateway
 * sources collected, as one server job; every module's Find is refreshed when it finishes. A paused module is refused.
 */
export async function startModuleImport(module: string, by: string, origin: string): Promise<{ ok: true; queued: number } | { ok: false; message: string }> {
  const hosted = hostedGateway();
  if (!hosted) return { ok: false, message: "The gateway isn't configured on this deployment." };
  const gw = (await loadScheduler()).gateway;
  if (gw.pausedModules.includes(module)) return { ok: false, message: "This module's import is paused; resume it first." };
  if (jobRunning(await readSetupJob())) return { ok: false, message: "An import is already running on the server." };
  const waiting = (await setupTodo()).items.filter((i) => i.run && i.module === module && !gw.dismissed.includes(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
  const live = await hosted.store.read((s) => (s.sources as { id: string; attribution?: string; modules: string[]; enabled: boolean; kind: string; externalCollection?: boolean }[]).filter((x) => x.enabled && x.modules.includes(module) && x.kind !== "upload" && !x.externalCollection).map((x) => ({ id: `collect:${x.id}`, name: String(x.attribution ?? x.id), run: { kind: "collect" as const, sourceId: x.id } })));
  const items = [...waiting, ...live];
  if (!items.length) return { ok: false, message: "Nothing to import for this module: no waiting sources and no live gateway sources." };
  const r = await startSetupJob(items, by, new Date(), "admin", { kind: "module", module });
  if (!r.ok) return { ok: false, message: r.message };
  await handOnSetupJob(origin);
  return { ok: true, queued: r.job.items.length };
}
