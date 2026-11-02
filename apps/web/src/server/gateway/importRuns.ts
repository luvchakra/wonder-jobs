/**
 * Every import run, kept (owner, 2026-11-02: "persist every run detail in folded form"): Import now, Import this module,
 * and each hourly collection, with what happened to each source. The newest 60 are kept; hourly runs that found nothing
 * in a row are folded into one entry (`repeats`), so they don't push real runs out. Never a secret.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

export interface ImportRunItem {
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
