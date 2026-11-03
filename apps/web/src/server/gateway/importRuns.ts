/**
 * Every import run, kept (owner, 2026-11-02: "persist every run detail in folded form"): Import now, Import this module,
 * and each hourly collection, with what happened to each source. The newest 60 are kept; hourly runs that found nothing
 * in a row are folded into one entry (`repeats`), so they don't push real runs out. Never a secret.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

export interface ImportRunItem {
  /** The Setup item's id ("gateway:src_…", "catalogue:<file>"), so a later run can tell it was tried. */
  id?: string;
  name: string;
  status: "live" | "failed" | "collected" | "pending";
  step?: string;
  message?: string;
  valid?: number;
}

export interface ImportRun {
  id: string;
  /** Import now (every waiting source), one module's import, or an hourly (or Run now) collection. */
  kind: "import" | "module" | "hourly";
  trigger: "admin" | "scheduler" | "cron";
  by?: string;
  module?: string;
  startedAt: string;
  finishedAt: string;
  items: ImportRunItem[];
  /** Listings in Find per module after the run's refresh. */
  stored?: Record<string, number>;
  summary: string;
  /** Hourly runs that found nothing, folded into this one (counting it). */
  repeats?: number;
}

const KEY = "wj.importruns" as const;
export const MAX_IMPORT_RUNS = 60;

export async function listImportRuns(): Promise<ImportRun[]> {
  const runs = ((await stateStore.get(PLATFORM_TENANT, KEY))?.state as { runs?: ImportRun[] } | undefined)?.runs;
  return Array.isArray(runs) ? runs : [];
}

const empty = (r: ImportRun) => r.kind === "hourly" && r.items.length === 0 && !Object.keys(r.stored ?? {}).length;

/** Adds a run (newest first). Never throws: a log write must not fail an import. */
export async function recordImportRun(run: ImportRun): Promise<void> {
  try {
    const runs = await listImportRuns();
    const last = runs[0];
    if (empty(run) && last && empty(last)) {
      runs[0] = { ...last, finishedAt: run.finishedAt, repeats: (last.repeats ?? 1) + 1, summary: run.summary };
    } else runs.unshift({ ...run, summary: run.summary.slice(0, 300), items: run.items.slice(0, 200).map((i) => ({ ...i, ...(i.message ? { message: i.message.slice(0, 300) } : {}) })) });
    await stateStore.put(PLATFORM_TENANT, KEY, { runs: runs.slice(0, MAX_IMPORT_RUNS) });
  } catch (e) {
    console.warn(`[import] could not record the run: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/** How long a source that didn't go live is left out of Import now and the hourly set-up before it's tried again. */
export const RETRY_AFTER_MS = 86_400_000;

/**
 * Sources whose last attempt, within `withinMs`, didn't go live: a site that refuses us (robots unreadable, 403, a
 * redirect elsewhere) or a test that found nothing. Import now leaves them out instead of retrying every one each time
 * (2026-11-02: 16 blocked sites held a whole import up for 10 minutes); the module's own Set up, or the row's button,
 * still tries one on purpose. A later success clears it.
 */
export async function recentFailures(withinMs = RETRY_AFTER_MS, now = Date.now()): Promise<Map<string, { at: string; step?: string; message?: string }>> {
  const out = new Map<string, { at: string; step?: string; message?: string }>();
  const settled = new Set<string>();
  for (const r of await listImportRuns()) {
    if (now - Date.parse(r.finishedAt) > withinMs) continue;
    for (const i of r.items) {
      if (!i.id || settled.has(i.id)) continue;
      settled.add(i.id);
      if (i.status === "failed") out.set(i.id, { at: r.finishedAt, ...(i.step ? { step: i.step } : {}), ...(i.message ? { message: i.message } : {}) });
    }
  }
  return out;
}

/** Whether a scheduled (cron) collection finished within the last `minutes` (server/gateway/budget.ts). */
export async function lastScheduledRunWithin(minutes: number, now = Date.now()): Promise<boolean> {
  const last = (await listImportRuns()).find((r) => r.kind === "hourly" && r.trigger === "cron");
  return !!last && now - Date.parse(last.finishedAt) < minutes * 60_000;
}
