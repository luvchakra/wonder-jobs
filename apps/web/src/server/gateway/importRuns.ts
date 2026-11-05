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

/** A source's own tries from its row (Try again, Test & activate), newest first: not runs, so not in Run history. */
type Tries = Record<string, { at: string; ok: boolean }[]>;
interface Doc { runs?: ImportRun[]; tries?: Tries }

async function readDoc(): Promise<{ runs: ImportRun[]; tries: Tries }> {
  const d = (await stateStore.get(PLATFORM_TENANT, KEY))?.state as Doc | undefined;
  return { runs: Array.isArray(d?.runs) ? d.runs : [], tries: d?.tries && typeof d.tries === "object" ? d.tries : {} };
}

export async function listImportRuns(): Promise<ImportRun[]> {
  return (await readDoc()).runs;
}

const empty = (r: ImportRun) => r.kind === "hourly" && r.items.length === 0 && !Object.keys(r.stored ?? {}).length;

/** Adds a run (newest first). Never throws: a log write must not fail an import. */
export async function recordImportRun(run: ImportRun): Promise<void> {
  try {
    const { runs, tries } = await readDoc();
    const last = runs[0];
    if (empty(run) && last && empty(last)) {
      runs[0] = { ...last, finishedAt: run.finishedAt, repeats: (last.repeats ?? 1) + 1, summary: run.summary };
    } else runs.unshift({ ...run, summary: run.summary.slice(0, 300), items: run.items.slice(0, 200).map((i) => ({ ...i, ...(i.message ? { message: i.message.slice(0, 300) } : {}) })) });
    await stateStore.put(PLATFORM_TENANT, KEY, { runs: runs.slice(0, MAX_IMPORT_RUNS), tries });
  } catch (e) {
    console.warn(`[import] could not record the run: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/** Failed tries in a row after which a source is archived (owner, 2026-11-05: "the sources which are failing even after multiple tries and fixes, move them to an archived section"). */
export const ARCHIVE_AFTER = 3;
const MAX_TRIED = 400;

/** Records one try of a source from its row. Never throws. */
export async function recordTry(id: string, ok: boolean, at = new Date().toISOString()): Promise<void> {
  try {
    const { runs, tries } = await readDoc();
    const next: Tries = { [id]: [{ at, ok }, ...(tries[id] ?? [])].slice(0, ARCHIVE_AFTER + 2) };
    for (const [k, v] of Object.entries(tries)) if (k !== id && Object.keys(next).length < MAX_TRIED) next[k] = v;
    await stateStore.put(PLATFORM_TENANT, KEY, { runs, tries: next });
  } catch (e) {
    console.warn(`[import] could not record the try: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/** Pure: each source's failed tries in a row, newest first, from the kept runs and its own tries; a success ends it. */
export function failStreaksOf(runs: ImportRun[], tries: Tries): Map<string, number> {
  const events = new Map<string, { at: string; ok: boolean }[]>();
  const add = (id: string, at: string, ok: boolean) => events.set(id, [...(events.get(id) ?? []), { at, ok }]);
  for (const r of runs) for (const i of r.items) if (i.id && (i.status === "failed" || i.status === "live")) add(i.id, r.finishedAt, i.status === "live");
  for (const [id, list] of Object.entries(tries)) for (const t of list) add(id, t.at, t.ok);
  const out = new Map<string, number>();
  for (const [id, list] of events) {
    let n = 0;
    for (const e of list.sort((a, b) => b.at.localeCompare(a.at))) {
      if (e.ok) break;
      n++;
    }
    if (n) out.set(id, n);
  }
  return out;
}

export async function failStreaks(): Promise<Map<string, number>> {
  const { runs, tries } = await readDoc();
  return failStreaksOf(runs, tries);
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
