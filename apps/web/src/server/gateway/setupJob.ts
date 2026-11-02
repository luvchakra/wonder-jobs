/**
 * Setup to-do's server job (owner, 2026-11-02: "keep the entire process backend job based ... ui based option only on
 * demand"). An admin's one press of "Test & activate all" queues the shown gateway items; the server then adds, tests,
 * activates and collects them one after another, and stores each module's listings in WorksLake (warm.ts). Closing the
 * page doesn't stop it. Each row's own button still runs that one item in the page, on demand.
 *
 * The press is the admin's activation (a source still goes live only after its test passes, as the button's would).
 * Runs in the press's request after the answer (`after`), up to a time budget; anything left is picked up by
 * /api/cron/gateway-setup, which the job calls for itself, and by the hourly gateway collection as a safety net.
 * One job at a time; a lease keeps two servers from running it at once.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { refreshGatewayListings } from "@/server/jobslake/warm";
import { recordImportRun, type ImportRun } from "./importRuns";
import { collectGatewaySource, registerFromCatalogue, setGatewaySource, testGatewaySource } from "./admin";

export type SetupRun = { kind: "add"; file: string } | { kind: "activate"; sourceId: string } | { kind: "collect"; sourceId: string };

export interface SetupJobItem {
  /** The Setup to-do item's id ("gateway:src_…", "catalogue:<file>"). */
  id: string;
  name: string;
  run: SetupRun;
  status: "pending" | "running" | "live" | "failed";
  step?: string;
  message?: string;
  valid?: number;
  /** When this item started and finished (for the page's progress and the run's record). */
  startedAt?: string;
  finishedAt?: string;
}

export interface SetupJob {
  id: string;
  by: string;
  createdAt: string;
  finishedAt?: string;
  /** Until when a server is working on it (ISO); another server waits until it has passed. */
  leaseUntil?: string;
  items: SetupJobItem[];
  /** Who started it: an admin's press on Setup to-do, or the scheduled Gateway collection. */
  trigger?: "admin" | "scheduler";
  /** Listings in Find per module after the job's refresh (every module, once, when the job finished). */
  stored?: Record<string, number>;
  /** Import now (every waiting source) or Import this module (that module's). */
  kind?: "import" | "module";
  module?: string;
  /** What the job is doing now: setting sources up, or refreshing Find once they're done. */
  phase?: "setup" | "refreshing";
}

const KEY = "wj.setupjob" as const;
/** Pause between sources, so shared servers aren't asked in a burst. */
export const SETUP_PAUSE_MS = 5000;
/** How long one server call works on the job before handing the rest on. */
export const SETUP_BUDGET_MS = 45_000;
const LEASE_MS = 70_000;
const MAX_ITEMS = 200;

export async function readSetupJob(): Promise<SetupJob | null> {
  return ((await stateStore.get(PLATFORM_TENANT, KEY))?.state as SetupJob | undefined) ?? null;
}
const save = (job: SetupJob) => stateStore.put(PLATFORM_TENANT, KEY, job);

export const jobRunning = (job: SetupJob | null) => !!job && !job.finishedAt;

/** Queues these items as the new job. Refused while another job hasn't finished. */
export async function startSetupJob(items: { id: string; name: string; run: SetupRun }[], by: string, now = new Date(), trigger: "admin" | "scheduler" = "admin", scope: { kind?: "import" | "module"; module?: string } = {}): Promise<{ ok: true; job: SetupJob } | { ok: false; message: string }> {
  const current = await readSetupJob();
  if (jobRunning(current)) return { ok: false, message: "A setup job is already running; it continues on the server." };
  if (!items.length) return { ok: false, message: "Nothing to run." };
  const job: SetupJob = { id: `setup_${now.getTime().toString(36)}`, by: by.slice(0, 120), createdAt: now.toISOString(), trigger, kind: scope.kind ?? "import", ...(scope.module ? { module: scope.module } : {}), phase: "setup", items: items.slice(0, MAX_ITEMS).map((i) => ({ ...i, status: "pending" })) };
  await save(job);
  return { ok: true, job };
}

/**
 * One item, as the row's button does it: add (if new) → test → activate when the test found valid listings → collect.
 * A "collect" item only collects a live source now (Import this module).
 */
export async function runSetupItem(run: SetupRun, onStep: (s: string) => void = () => undefined): Promise<{ ok: true; valid: number; sourceId: string } | { ok: false; step: string; message: string }> {
  const msg = (b: Record<string, unknown>, fallback: string) => String((b.error as { message?: string } | undefined)?.message ?? fallback);
  if (run.kind === "collect") {
    onStep("Collect");
    const c = await collectGatewaySource(run.sourceId);
    return c.ok ? { ok: true, valid: c.valid ?? 0, sourceId: run.sourceId } : { ok: false, step: "Collect", message: c.code };
  }
  let sourceId = run.kind === "activate" ? run.sourceId : "";
  if (run.kind === "add") {
    onStep("Add");
    const r = await registerFromCatalogue(run.file);
    if (r.status >= 300) return { ok: false, step: "Add", message: msg(r.body, `Add failed (${r.status})`) };
    sourceId = String(r.body.id ?? "");
    if (!sourceId) return { ok: false, step: "Add", message: "The gateway didn't return the new source." };
  }
  onStep("Test");
  const t = await testGatewaySource(sourceId);
  if (t.status >= 300) return { ok: false, step: "Test", message: msg(t.body, `Test failed (${t.status})`) };
  const valid = Number(t.body.valid ?? 0);
  if (!valid) return { ok: false, step: "Test", message: "The test found no valid listings, so it stays paused." };
  onStep("Activate");
  const a = await setGatewaySource(sourceId, "activate");
  if (a.status >= 300) return { ok: false, step: "Activate", message: msg(a.body, `Activate failed (${a.status})`) };
  onStep("Collect");
  const c = await collectGatewaySource(sourceId);
  // Live either way; a failed first collection is retried by the hourly run.
  return { ok: true, valid: c.ok ? (c.valid ?? valid) : valid, sourceId };
}

export interface ContinueDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  run?: typeof runSetupItem;
  refresh?: () => Promise<{ stored: Record<string, number> }>;
}

/**
 * Works on the job until it's done or the time budget runs out. Returns whether items are left (so the caller hands
 * them on). Does nothing while another server holds the lease.
 */
export async function continueSetupJob(deps: ContinueDeps = {}): Promise<{ ran: number; left: number; done: boolean; refreshed?: boolean }> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const run = deps.run ?? runSetupItem;
  const refresh = deps.refresh ?? (() => refreshGatewayListings());
  const job = await readSetupJob();
  if (!job || job.finishedAt) return { ran: 0, left: 0, done: true };
  if (job.leaseUntil && Date.parse(job.leaseUntil) > now()) return { ran: 0, left: job.items.filter((i) => i.status !== "live" && i.status !== "failed").length, done: false };
  const started = now();
  job.leaseUntil = new Date(started + LEASE_MS).toISOString();
  // An item left "running" by a server that stopped mid-way is tried again.
  for (const i of job.items) if (i.status === "running") i.status = "pending";
  await save(job);
  let ran = 0;
  for (const item of job.items) {
    if (item.status !== "pending") continue;
    if (now() - started >= SETUP_BUDGET_MS) break;
    if (ran > 0) await sleep(SETUP_PAUSE_MS);
    item.status = "running";
    item.startedAt = new Date(now()).toISOString();
    await save(job);
    // Each step is saved as it starts, so a reloaded page shows exactly where the job is.
    const r = await run(item.run, (s) => {
      item.step = s;
      void save(job).catch(() => undefined);
    }).catch((e: unknown) => ({ ok: false as const, step: item.step ?? "Run", message: e instanceof Error ? e.message : String(e) }));
    if (r.ok) {
      Object.assign(item, { status: "live", valid: r.valid, step: undefined, message: undefined });
    } else Object.assign(item, { status: "failed", step: r.step, message: r.message.slice(0, 300) });
    item.finishedAt = new Date(now()).toISOString();
    ran++;
    job.leaseUntil = new Date(now() + LEASE_MS).toISOString();
    await save(job);
  }
  const left = job.items.filter((i) => i.status === "pending").length;
  // Done: one refresh of every module's gateway listings, so all new entries appear in Find (warm.ts).
  let refreshed = false;
  if (!left) {
    // An admin's import always ends with a refresh, so Find is up to date even when nothing new went live; the
    // hourly set-up refreshes only when something did.
    if (job.items.some((i) => i.status === "live") || (job.trigger ?? "admin") === "admin") {
      job.phase = "refreshing";
      await save(job);
      const r = await refresh().catch(() => null);
      if (r) {
        job.stored = r.stored;
        refreshed = true;
      }
    }
    job.finishedAt = new Date(now()).toISOString();
  }
  job.leaseUntil = undefined;
  await save(job);
  if (job.finishedAt) await recordImportRun(runFromJob(job));
  return { ran, left, done: !left, refreshed };
}

/**
 * Hands the rest of the job to a fresh server call (/api/cron/gateway-setup), so a long list never depends on one
 * request or on the admin's page. Waits only for the call to be accepted.
 */
export async function handOnSetupJob(origin: string, secret = process.env.CRON_SECRET): Promise<boolean> {
  if (!secret) return false;
  try {
    await fetch(new URL("/api/cron/gateway-setup", origin), { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(2500), cache: "no-store" });
    return true;
  } catch {
    // A timeout here is expected: the next call keeps working after this one stops waiting.
    return true;
  }
}

/** A finished job as its run record: what happened to each source and what reached Find. */
export function runFromJob(job: SetupJob): ImportRun {
  const live = job.items.filter((i) => i.status === "live").length;
  const failed = job.items.filter((i) => i.status === "failed").length;
  return {
    id: job.id,
    kind: job.kind ?? "import",
    trigger: job.trigger ?? "admin",
    by: job.by,
    ...(job.module ? { module: job.module } : {}),
    startedAt: job.createdAt,
    finishedAt: job.finishedAt ?? new Date().toISOString(),
    items: job.items.map((i) => ({ id: i.id, name: i.name, status: i.status === "running" ? "pending" : i.status, ...(i.step ? { step: i.step } : {}), ...(i.message ? { message: i.message } : {}), ...(i.valid != null ? { valid: i.valid } : {}) })),
    ...(job.stored ? { stored: job.stored } : {}),
    summary: `${live} of ${job.items.length} went live${failed ? ` · ${failed} didn't` : ""}${job.stored ? ` · Find refreshed` : ""}`,
  };
}
