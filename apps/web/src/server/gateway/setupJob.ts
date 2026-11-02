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
import { warmGatewayModules } from "@/server/jobslake/warm";
import { collectGatewaySource, gatewaySourceModules, registerFromCatalogue, setGatewaySource, testGatewaySource } from "./admin";

export type SetupRun = { kind: "add"; file: string } | { kind: "activate"; sourceId: string };

export interface SetupJobItem {
  /** The Setup to-do item's id ("gateway:src_…", "catalogue:<file>"). */
  id: string;
  name: string;
  run: SetupRun;
  status: "pending" | "running" | "live" | "failed";
  step?: string;
  message?: string;
  valid?: number;
}

export interface SetupJob {
  id: string;
  by: string;
  createdAt: string;
  finishedAt?: string;
  /** Until when a server is working on it (ISO); another server waits until it has passed. */
  leaseUntil?: string;
  items: SetupJobItem[];
  /** Listings stored in WorksLake per module once the job's sources were live. */
  stored?: Record<string, number>;
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
export async function startSetupJob(items: { id: string; name: string; run: SetupRun }[], by: string, now = new Date()): Promise<{ ok: true; job: SetupJob } | { ok: false; message: string }> {
  const current = await readSetupJob();
  if (jobRunning(current)) return { ok: false, message: "A setup job is already running; it continues on the server." };
  if (!items.length) return { ok: false, message: "Nothing to run." };
  const job: SetupJob = { id: `setup_${now.getTime().toString(36)}`, by: by.slice(0, 120), createdAt: now.toISOString(), items: items.slice(0, MAX_ITEMS).map((i) => ({ ...i, status: "pending" })) };
  await save(job);
  return { ok: true, job };
}

/** One item, as the row's button does it: add (if new) → test → activate when the test found valid listings → collect. */
export async function runSetupItem(run: SetupRun, onStep: (s: string) => void = () => undefined): Promise<{ ok: true; valid: number; sourceId: string } | { ok: false; step: string; message: string }> {
  const msg = (b: Record<string, unknown>, fallback: string) => String((b.error as { message?: string } | undefined)?.message ?? fallback);
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
  modulesOf?: (sourceId: string) => Promise<string[]>;
  warm?: (modules: string[]) => Promise<{ module: string; stored: number }[]>;
}

/**
 * Works on the job until it's done or the time budget runs out. Returns whether items are left (so the caller hands
 * them on). Does nothing while another server holds the lease.
 */
export async function continueSetupJob(deps: ContinueDeps = {}): Promise<{ ran: number; left: number; done: boolean }> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const run = deps.run ?? runSetupItem;
  const modulesOf = deps.modulesOf ?? gatewaySourceModules;
  const warm = deps.warm ?? warmGatewayModules;
  const job = await readSetupJob();
  if (!job || job.finishedAt) return { ran: 0, left: 0, done: true };
  if (job.leaseUntil && Date.parse(job.leaseUntil) > now()) return { ran: 0, left: job.items.filter((i) => i.status !== "live" && i.status !== "failed").length, done: false };
  const started = now();
  job.leaseUntil = new Date(started + LEASE_MS).toISOString();
  // An item left "running" by a server that stopped mid-way is tried again.
  for (const i of job.items) if (i.status === "running") i.status = "pending";
  await save(job);
  const touched = new Set<string>();
  let ran = 0;
  for (const item of job.items) {
    if (item.status !== "pending") continue;
    if (now() - started >= SETUP_BUDGET_MS) break;
    if (ran > 0) await sleep(SETUP_PAUSE_MS);
    item.status = "running";
    await save(job);
    const r = await run(item.run, (s) => (item.step = s)).catch((e: unknown) => ({ ok: false as const, step: item.step ?? "Run", message: e instanceof Error ? e.message : String(e) }));
    if (r.ok) {
      Object.assign(item, { status: "live", valid: r.valid, step: undefined, message: undefined });
      for (const m of await modulesOf(r.sourceId).catch(() => [])) touched.add(m);
    } else Object.assign(item, { status: "failed", step: r.step, message: r.message.slice(0, 300) });
    ran++;
    job.leaseUntil = new Date(now() + LEASE_MS).toISOString();
    await save(job);
  }
  // The sources that went live: their listings go into WorksLake's store now, so Find shows them at once.
  if (touched.size) {
    const stored = await warm([...touched]).catch(() => []);
    job.stored = { ...job.stored };
    for (const s of stored) job.stored[s.module] = (job.stored[s.module] ?? 0) + s.stored;
  }
  const left = job.items.filter((i) => i.status === "pending").length;
  if (!left) job.finishedAt = new Date(now()).toISOString();
  job.leaseUntil = undefined;
  await save(job);
  return { ran, left, done: !left };
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
