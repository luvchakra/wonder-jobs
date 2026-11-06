/**
 * The collection on the GitHub Actions runner (owner, 2026-11-06: "Move the collection and Find refresh off Vercel onto
 * the GitHub Actions runner … leaving the site to serve pages"; Vercel had paused the site for CPU use). The same job
 * as collectJob.ts, run as one process with minutes rather than Vercel's 60 s, so there are no hops, hand-ons or
 * deadlines to work around. The workflow (.github/workflows/gateway-collect.yml) runs scripts/gateway-collect.mjs,
 * which calls `runOnRunner` with the repository's secrets as its environment.
 *  1. Finishes any Setup job left over (sources are tested, activated and collected one after another).
 *  2. Scheduled: collects every due source, then refreshes Find. Import now / Import this module (the admin's press,
 *     dispatched here by dispatch.ts): queues the waiting sources as a Setup job, as the page does.
 *  3. Drains that job to the end; it refreshes every module's Find and emails the admins when it finishes.
 */
import { refreshGatewayListings } from "@/server/jobslake/warm";
import { siteUrl } from "@/lib/siteUrl";
import { runGatewayCollection, startImport, startModuleImport } from "./collectJob";
import { continueSetupJob, runSetupItem, SETUP_PAUSE_MS } from "./setupJob";

/** The runner's budgets: collection's share and the Find refresh's deadline, from the run's start. */
export const RUNNER_LIMITS = { collectMs: 20 * 60_000, deadlineMs: 25 * 60_000 };
/** A crawl step (a test, a first collection) may read for a minute here; Vercel allowed 20 s (setupJob.ts). */
export const RUNNER_STEP_BUDGET_MS = 60_000;
/** Each call of the Setup job runs what fits its own budget; the runner calls again until it's done, at most this often. */
export const MAX_SETUP_CALLS = 500;
const never = async () => false;

export type RunnerMode = "scheduled" | "all" | "module";

export interface RunnerDeps {
  continueSetup?: typeof continueSetupJob;
  collect?: typeof runGatewayCollection;
  importAll?: typeof startImport;
  importModule?: typeof startModuleImport;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Works the Setup job until it's done: each call runs what fits its budget, so the runner just calls again. */
export async function drainSetupJob(deps: RunnerDeps = {}): Promise<{ calls: number; ran: number; done: boolean }> {
  const cont = deps.continueSetup ?? continueSetupJob;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let ran = 0;
  for (let calls = 1; calls <= MAX_SETUP_CALLS; calls++) {
    const r = await cont({
      run: (run, onStep) => runSetupItem(run, onStep, RUNNER_STEP_BUDGET_MS),
      // The refresh gets the runner's deadline, not a Vercel call's 45 s.
      refresh: (modules) => refreshGatewayListings(modules, new Date(), Date.now() + RUNNER_LIMITS.deadlineMs),
    });
    ran += r.ran;
    // Done, or nothing this process can do (no job, or another server holds its lease).
    if (r.done || !r.more) return { calls, ran, done: r.done };
    await sleep(SETUP_PAUSE_MS);
  }
  return { calls: MAX_SETUP_CALLS, ran, done: false };
}

/**
 * One run on the runner. `ok` is false only when the run itself couldn't happen (a refused import, a missing module);
 * a source that failed is in the summary and the run's record, as on Vercel.
 */
export async function runOnRunner(input: { mode: RunnerMode; module?: string; by?: string; force?: boolean }, deps: RunnerDeps = {}): Promise<{ ok: boolean; summary: string }> {
  const log = deps.log ?? ((line: string) => console.info(`[gateway-runner] ${line}`));
  const collect = deps.collect ?? runGatewayCollection;
  const origin = siteUrl().origin;
  const by = input.by?.trim().slice(0, 120) || "GitHub (Run workflow)";
  const lines: string[] = [];

  const before = await drainSetupJob(deps);
  if (before.ran) lines.push(`finished a Setup job left over: ${before.ran} items`);

  if (input.mode === "scheduled") {
    const r = await collect("cron", origin, undefined, 0, never, undefined, [], { limits: RUNNER_LIMITS, handOnSetup: never, force: input.force });
    lines.push(r.summary);
  } else if (input.mode === "all") {
    const r = await (deps.importAll ?? startImport)(by, origin, { handOn: never, collect: (t, o) => collect(t, o, undefined, 0, never, undefined, [], { limits: RUNNER_LIMITS, handOnSetup: never }) });
    if (!r.ok) return { ok: false, summary: r.message };
    lines.push(r.queued ? `${r.queued} waiting sources queued${r.skipped ? ` (${r.skipped} skipped)` : ""}` : (r.summary ?? "collected and refreshed"));
  } else {
    if (!input.module) return { ok: false, summary: "Name the module." };
    const r = await (deps.importModule ?? startModuleImport)(input.module, by, origin, { handOn: never });
    if (!r.ok) return { ok: false, summary: r.message };
    lines.push(`${r.queued} steps queued for ${input.module}`);
  }

  const after = await drainSetupJob(deps);
  if (after.ran || !after.done) lines.push(`Setup job: ${after.ran} items${after.done ? "" : " (not finished)"}`);
  const summary = lines.join(" · ");
  log(summary);
  return { ok: true, summary };
}
