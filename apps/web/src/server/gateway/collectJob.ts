/**
 * The gateway's one scheduled job (Scheduler → Gateway collection), run on the GitHub Actions runner every 3 hours
 * (runner.ts, owner 2026-11-06: the collection and Find refresh moved off Vercel) and by an admin's Import now (which
 * starts that runner, or runs here when it isn't set up): the same code either way, so there is one job, not two.
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
import type { CollectProgress } from "../../../../data-gateway/src/handler.mjs";
import { gatewaySourceModules } from "./admin";
import { syncCatalogueDefinitions } from "./catalogueSync";
import { handOnSetupJob, jobRunning, readSetupJob, startSetupJob } from "./setupJob";
import { ARCHIVE_AFTER, failStreaks, lastScheduledRunWithin, listImportRuns, recentFailures, recordImportRun, RETRY_AFTER_MS, type ImportRun } from "./importRuns";
import { sendImportEmail } from "./importEmail";
import { MIN_GAP_MINUTES, SOURCE_FLOOR_MINUTES } from "@/domain/gateway/budget";
import { MODULE_IDS } from "@/wonderworks/manifest";

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
  /** More to do: the call that carries on (hop, chain id, modules still to refresh). An outside driver calls it next. */
  next?: { hop: number; chain: string; refresh: string[] };
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

/** Sources that failed ARCHIVE_AFTER tries in a row: on the Import page's Archived list, and left out of every automatic try. */
export async function archivedIds(): Promise<string[]> {
  const streaks = await failStreaks().catch(() => new Map<string, number>());
  return [...streaks].filter(([, n]) => n >= ARCHIVE_AFTER).map(([id]) => id);
}

/** Waiting gateway sources to test and activate: added and paused, not tried and failed in the last day, not in a paused module. */
async function waitingItems(pausedModules: string[], dismissed: string[] = []) {
  const [todo, failed, archived] = await Promise.all([setupTodo(), failedLately(), archivedIds()]);
  const skip = new Set([...failed.keys(), ...dismissed, ...archived]);
  return todo.items.filter((i) => i.run?.kind === "activate" && !skip.has(i.id) && !pausedModules.includes(i.module)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
}

/**
 * Calls a run's collection hands on to when sources are still due after its time ran out (owner, 2026-11-05: "identify
 * all the issues": each call collected 2-3 of ~15 due sources, so most were days overdue). Each follow-up call collects
 * the next ones; the chain stops when nothing is left due or after this many calls. Vercel refuses a call from this
 * app to itself after about five in a row (508 Loop Detected, 2026-11-05), so the scheduled workflow drives the chain
 * from outside (`x-wj-driver: external`, gateway-collect.yml), calling each `next` itself; the self-call is the fallback
 * for Vercel's own daily cron.
 */
export const MAX_COLLECT_HOPS = 30;
/** How long into a call its Find refresh may still start a module (the rest of the 60 s is the run's record). */
export const CALL_DEADLINE_MS = 48_000;

/** Starts the next call of a collection chain and returns without waiting for it (like handOnSetupJob). */
export async function handOnCollection(origin: string, hop: number, chain: string, refresh: string[] = [], secret = process.env.CRON_SECRET, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!secret || hop > MAX_COLLECT_HOPS) return false;
  try {
    const url = new URL("/api/cron/gateway-collect", origin);
    url.searchParams.set("hop", String(hop));
    url.searchParams.set("chain", chain);
    if (refresh.length) url.searchParams.set("refresh", refresh.join(","));
    await fetcher(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(2500), cache: "no-store" });
  } catch {
    // A timeout here is expected: the next call keeps working after this one stops waiting.
  }
  return true;
}

export interface CollectionOptions {
  /**
   * Time budgets from the call's start: collection's share, and by when the Find refresh may still start a module.
   * Default: a Vercel call's (COLLECT_BUDGET_MS, CALL_DEADLINE_MS). The GitHub runner passes minutes (runner.ts).
   */
  limits?: { collectMs: number; deadlineMs: number };
  /** Carries a running Setup job on to its own call (handOnSetupJob). The runner drains the job itself instead. */
  handOnSetup?: (origin: string) => Promise<boolean>;
  /** Collect now even right after the last scheduled run (a run started by hand). Each source's own floor still holds. */
  force?: boolean;
  /** The runner's live progress (liveRun.ts): each due source as it starts and ends, and each module's Find refresh. */
  onProgress?: (e: CollectProgress) => void;
  onRefresh?: (modules: string[]) => void;
  onModule?: (module: string, stored: number | null, next?: string) => void;
}

export async function runGatewayCollection(trigger: "cron" | "admin", origin: string, notify: (run: ImportRun, earlier: ImportRun[]) => Promise<unknown> = sendImportEmail, hop = 0, handOn: typeof handOnCollection = handOnCollection, chain?: string, pendingRefresh: string[] = [], opts: CollectionOptions = {}): Promise<GatewayRunResult> {
  const startedAt = new Date().toISOString();
  const handOnSetup = opts.handOnSetup ?? handOnSetupJob;
  // Everything a Vercel call does must end inside its 60 s: refreshing Find stops by here and leaves the rest to the
  // next call (2026-11-05: refreshing every module in the same call ran past 60 s, a 504, and nothing was recorded).
  // On the GitHub runner the limits are minutes, and one call does everything (runner.ts).
  const deadline = Date.parse(startedAt) + (opts.limits?.deadlineMs ?? CALL_DEADLINE_MS);
  // Every call of a chain records into the first call's run.
  const runId = `hourly_${chain && /^[a-z0-9]{4,16}$/.test(chain) ? chain : Date.parse(startedAt).toString(36)}`;
  const hosted = hostedGateway();
  if (!hosted) return { ok: true, skipped: "gateway not configured", summary: "Gateway not configured" };
  const settings = await loadScheduler();

  let queued = 0;
  if (hop === 0 && settings.gateway.activateWaiting && !jobRunning(await readSetupJob())) {
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
  // A chain's follow-up call carries on its own run, so the "ran recently" check is only for a fresh trigger.
  if (hop === 0 && !opts.force && trigger === "cron" && (await lastScheduledRunWithin(MIN_GAP_MINUTES))) {
    const running = jobRunning(await readSetupJob());
    if (running) await handOnSetup(origin);
    if (!running && (await findStale())) {
      const r = await refreshGatewayListings(undefined, new Date(), deadline).catch(() => null);
      const stored = r?.stored;
      const next = r?.remaining?.length && (await handOn(origin, 1, runId.slice("hourly_".length), r.remaining)) ? { hop: 1, chain: runId.slice("hourly_".length), refresh: r.remaining } : undefined;
      if (stored) {
        const summary = `Ran recently · Find refreshed: ${Object.entries(stored).map(([m, n]) => `${n} ${m}`).join(", ")}`;
        const finishedAt = new Date().toISOString();
        await recordImportRun({ id: runId, kind: "hourly", trigger: "cron", startedAt, finishedAt, items: [], stored, summary });
        return { ok: true, skipped: "ran recently", summary, refreshed: stored, ...(next ? { next } : {}) };
      }
    }
    return { ok: true, skipped: "ran recently", summary: running ? "Ran recently · Setup job continuing" : "Ran recently: nothing to do" };
  }
  const floor = trigger === "cron" ? SOURCE_FLOOR_MINUTES : 0;
  // Collection takes at most COLLECT_BUDGET_MS of the call (each source only the time left), so the Find refresh and the
  // run's record still fit in Vercel's 60 s: runs that ran out of time (504) never refreshed Find (owner, 2026-11-04:
  // descriptions stayed flattened after the fix).
  // Registered sources first take their reviewed files' current outside-use flag and dataset bindings (WJ-815).
  await syncCatalogueDefinitions().catch(() => undefined);
  const outcomes = (await hosted.gateway.collectDue(opts.limits?.collectMs ?? COLLECT_BUDGET_MS, settings.gateway.pausedModules, floor, opts.onProgress ?? null)).map((o) => ({ sourceId: o.sourceId, ok: o.ok, code: o.code, valid: o.valid }));
  const setupRunning = jobRunning(await readSetupJob());
  if (setupRunning) await handOnSetup(origin);

  // One refresh per run: a running Setup job refreshes every module itself when it finishes.
  let refreshed: Record<string, number> | undefined;
  let refreshLeft: string[] = [];
  const collected = outcomes.filter((o) => o.ok && (o.valid ?? 0) > 0);
  const stale = !setupRunning && (await findStale());
  // Modules to refresh: every one on Run now or when Find is stale, else the ones collected for; plus any an earlier call
  // of the chain ran out of time for. Each call refreshes what fits before its deadline and hands the rest on.
  const wanted = setupRunning ? [] : trigger === "admin" || stale ? MODULE_IDS.slice() : [...pendingRefresh, ...(await Promise.all(collected.map((o) => gatewaySourceModules(o.sourceId)))).flat()];
  if (wanted.length) {
    const mods = [...new Set([...pendingRefresh, ...wanted])];
    opts.onRefresh?.(mods);
    const r = await refreshGatewayListings(mods, new Date(), deadline, opts.onModule).catch(() => null);
    if (r && Object.keys(r.stored).length) refreshed = r.stored;
    refreshLeft = r?.remaining ?? [];
  }

  const failed = outcomes.filter((o) => !o.ok).length;
  const deferred = outcomes.filter((o) => o.code === "DEFERRED").length;
  // Sources still due once this call's time ran out, or modules not yet refreshed: the next call in the chain does them.
  const continues = (deferred > 0 || refreshLeft.length > 0) && hop < MAX_COLLECT_HOPS && (await handOn(origin, hop + 1, runId.slice("hourly_".length), refreshLeft));
  const parts = [`${outcomes.length} due · ${collected.length} collected${failed ? ` · ${failed} failed` : ""}${deferred ? ` · ${deferred} ${continues ? "carried to the next call" : "left for the next run"}` : ""}`];
  if (hop) parts.push(`call ${hop + 1}`);
  if (queued) parts.push(`${queued} waiting sources queued to test & activate`);
  else if (setupRunning) parts.push("Setup job continuing");
  if (refreshed) parts.push(`Find refreshed: ${Object.entries(refreshed).map(([m, n]) => `${n} ${m}`).join(", ")}`);
  if (refreshLeft.length) parts.push(`${refreshLeft.length} modules' refresh ${continues ? "carried to the next call" : "left for the next run"}`);
  const summary = parts.join(" · ");
  const finishedAt = new Date().toISOString();
  await recordCronRun({ job: "gateway-collect", trigger, startedAt, finishedAt, outcome: failed && !collected.length ? "failed" : "ok", summary });
  // The run's own record, with each source's outcome (Sources → Import → Runs).
  const names = await hosted.store.read((s) => new Map((s.sources as { id: string; attribution?: string }[]).map((x) => [x.id, String(x.attribution ?? x.id)]))).catch(() => new Map<string, string>());
  const record: ImportRun = {
    id: runId,
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
  // The admins hear about every collection that collected or refreshed anything, like an import (importEmail.ts); a chain
  // is one email, from its last call.
  if (!continues) await notify(record, earlier);
  return { ok: !failed, summary, outcomes, queued, ...(refreshed ? { refreshed } : {}), ...(continues ? { next: { hop: hop + 1, chain: runId.slice("hourly_".length), refresh: refreshLeft } } : {}) };
}

/**
 * Import now (Sources → Import): the one press that runs the whole pipeline. Waiting sources (added, not live:
 * catalogue entries to add, gateway sources to test and activate) are queued as a Setup job, which refreshes every
 * module's Find when it finishes; with nothing waiting, the collection runs now and refreshes every module itself.
 * Either way the work runs on the server after the answer; the page shows how far it got.
 */
export interface ImportDeps {
  /** Carries the queued Setup job on to its own server call (handOnSetupJob); the runner drains the job itself. */
  handOn?: typeof handOnSetupJob;
  /** The collection to run when nothing is waiting (runGatewayCollection on Vercel; with the runner's limits there). */
  collect?: (trigger: "admin", origin: string) => Promise<GatewayRunResult>;
}

export async function startImport(by: string, origin: string, deps: ImportDeps = {}): Promise<{ ok: true; queued: number; skipped: number; summary?: string } | { ok: false; message: string }> {
  if (!hostedGateway()) return { ok: false, message: "The gateway isn't configured on this deployment." };
  if (jobRunning(await readSetupJob())) return { ok: false, message: "An import is already running on the server." };
  const [{ pausedModules, dismissed: dismissed0 }, failed, archived] = await Promise.all([loadScheduler().then((s) => s.gateway), failedLately(), archivedIds()]);
  // Archived sources (failed ARCHIVE_AFTER tries in a row) are only tried again from their row.
  const dismissed = [...dismissed0, ...archived];
  // Sources that didn't go live in the last day (a site that refuses us, a test that found nothing) are left out:
  // retrying every one held a whole import up. Each still has its own Test & activate on its module's card.
  const waiting = (await setupTodo()).items.filter((i) => i.run && !pausedModules.includes(i.module) && !dismissed.includes(i.id));
  const items = waiting.filter((i) => !failed.has(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
  const skipped = waiting.length - items.length;
  if (items.length) {
    const r = await startSetupJob(items, by);
    if (!r.ok) return { ok: false, message: r.message };
    // The job's own call does the work and hands the rest on, and refreshes every module's Find when it's done.
    await (deps.handOn ?? handOnSetupJob)(origin);
    return { ok: true, queued: r.job.items.length, skipped };
  }
  // Nothing new to set up: collect what's due and refresh every module's Find now.
  const c = await (deps.collect ?? ((t, o) => runGatewayCollection(t, o)))("admin", origin);
  return { ok: true, queued: 0, skipped, summary: c.summary };
}

/**
 * Import this module now (Sources → Import, on a module's card): its waiting sources are set up and its live gateway
 * sources collected, as one server job; every module's Find is refreshed when it finishes. A paused module is refused.
 */
export async function startModuleImport(module: string, by: string, origin: string, deps: Pick<ImportDeps, "handOn"> = {}): Promise<{ ok: true; queued: number } | { ok: false; message: string }> {
  const hosted = hostedGateway();
  if (!hosted) return { ok: false, message: "The gateway isn't configured on this deployment." };
  const gw = (await loadScheduler()).gateway;
  if (gw.pausedModules.includes(module)) return { ok: false, message: "This module's import is paused; resume it first." };
  if (jobRunning(await readSetupJob())) return { ok: false, message: "An import is already running on the server." };
  const archived = await archivedIds();
  const waiting = (await setupTodo()).items.filter((i) => i.run && i.module === module && !gw.dismissed.includes(i.id) && !archived.includes(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
  const live = await hosted.store.read((s) => (s.sources as { id: string; attribution?: string; modules: string[]; enabled: boolean; kind: string; externalCollection?: boolean }[]).filter((x) => x.enabled && x.modules.includes(module) && x.kind !== "upload" && !x.externalCollection).map((x) => ({ id: `collect:${x.id}`, name: String(x.attribution ?? x.id), run: { kind: "collect" as const, sourceId: x.id } })));
  const items = [...waiting, ...live];
  if (!items.length) return { ok: false, message: "Nothing to import for this module: no waiting sources and no live gateway sources." };
  const r = await startSetupJob(items, by, new Date(), "admin", { kind: "module", module });
  if (!r.ok) return { ok: false, message: r.message };
  await (deps.handOn ?? handOnSetupJob)(origin);
  return { ok: true, queued: r.job.items.length };
}
