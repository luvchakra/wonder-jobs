/**
 * The collection runner's live progress (owner, 2026-11-07: "i clicked on import now, but doesnt show any progress …
 * show progress and whats completed"). Import now hands the work to GitHub (dispatch.ts), so the site can't see it
 * running. The press records a request here; the runner (runner.ts) records each step as it goes: started, each
 * source's collection, each module's Find refresh, done. Sources → Import reads it while a run is on. Platform tenant
 * only, one small document, never a secret.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import type { CollectProgress } from "../../../../data-gateway/src/handler.mjs";

const KEY = "wj.liverun" as const;

export type LiveRunMode = "scheduled" | "all" | "module" | "resume";
export type LiveRunStep = "starting" | "setup" | "collecting" | "refreshing" | "done";

export interface LiveRunSource {
  id: string;
  name: string;
  status: "waiting" | "running" | "collected" | "failed" | "deferred";
  valid?: number;
  message?: string;
}

export interface LiveRun {
  id: string;
  mode: LiveRunMode;
  module?: string;
  by: string;
  state: "running" | "done" | "failed";
  step: LiveRunStep;
  /** Steps this run went through, in order (setup only when there were sources waiting to set up). */
  steps: LiveRunStep[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  sources: LiveRunSource[];
  refresh: { modules: string[]; done: Record<string, number>; current?: string };
  summary?: string;
  /** The GitHub Actions run, for "View on GitHub". */
  runUrl?: string;
}

/** An Import now / Import this module press, sent to GitHub and not picked up yet. */
export interface LiveRequest {
  mode: Exclude<LiveRunMode, "scheduled">;
  module?: string;
  by: string;
  at: string;
}

export interface LiveDoc {
  request?: LiveRequest;
  run?: LiveRun;
}

/** A request the runner hasn't picked up in this long is shown as not started (GitHub usually starts in under a minute). */
export const REQUEST_STALE_MS = 10 * 60_000;
/** A run that said nothing for this long is shown as stopped (one source's crawl is capped at a minute or two). */
export const RUN_SILENT_MS = 20 * 60_000;
const MAX_SOURCES = 200;

/** Pure: whether a request or run is still under way, as the page and the Import route judge it. */
export function liveActive(doc: LiveDoc | null | undefined, now = Date.now()): boolean {
  if (!doc) return false;
  if (doc.request && now - Date.parse(doc.request.at) < REQUEST_STALE_MS) return true;
  return !!doc.run && doc.run.state === "running" && now - Date.parse(doc.run.updatedAt) < RUN_SILENT_MS;
}

/** Pure: a collection event applied to the run. */
export function applyProgress(run: LiveRun, e: CollectProgress, names: Map<string, string>): LiveRun {
  const name = (id: string) => names.get(id) ?? id;
  if (e.type === "due") {
    const known = new Set(run.sources.map((s) => s.id));
    const added = e.ids.filter((id) => !known.has(id)).map((id): LiveRunSource => ({ id, name: name(id), status: "waiting" }));
    return { ...run, step: "collecting", steps: withStep(run.steps, "collecting"), sources: [...run.sources, ...added].slice(0, MAX_SOURCES) };
  }
  const update = (s: LiveRunSource): LiveRunSource => {
    if (s.id !== e.sourceId) return s;
    if (e.type === "start") return { ...s, status: "running" };
    if (e.code === "DEFERRED") return { id: s.id, name: s.name, status: "deferred" };
    return { id: s.id, name: s.name, status: e.ok ? "collected" : "failed", ...(e.valid != null ? { valid: e.valid } : {}), ...(e.ok ? {} : { message: e.code ?? "failed" }) };
  };
  const has = run.sources.some((s) => s.id === e.sourceId);
  const sources = has ? run.sources.map(update) : [...run.sources, update({ id: e.sourceId, name: name(e.sourceId), status: "waiting" })].slice(0, MAX_SOURCES);
  return { ...run, sources };
}

const withStep = (steps: LiveRunStep[], step: LiveRunStep) => (steps.includes(step) ? steps : [...steps, step]);

/** Pure: the run moved on to a step. */
export function atStep(run: LiveRun, step: LiveRunStep): LiveRun {
  return { ...run, step, steps: withStep(run.steps, step) };
}

/** Pure: Find's refresh started for these modules, moved to one, or finished one. */
export function refreshing(run: LiveRun, modules: string[]): LiveRun {
  const all = [...new Set([...run.refresh.modules, ...modules])];
  return atStep({ ...run, refresh: { ...run.refresh, modules: all } }, "refreshing");
}
export function refreshedModule(run: LiveRun, module: string, stored: number | null, next?: string): LiveRun {
  const done = stored == null ? run.refresh.done : { ...run.refresh.done, [module]: stored };
  return { ...run, refresh: { modules: run.refresh.modules, done, ...(next ? { current: next } : {}) } };
}

async function read(): Promise<LiveDoc> {
  try {
    const d = (await stateStore.get(PLATFORM_TENANT, KEY))?.state as LiveDoc | undefined;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

export async function readLiveRun(): Promise<LiveDoc> {
  return read();
}

/** Records an Import now / Import this module press that GitHub accepted. Never throws. */
export async function recordLiveRequest(request: LiveRequest): Promise<void> {
  try {
    const d = await read();
    await stateStore.put(PLATFORM_TENANT, KEY, { ...d, request });
  } catch (e) {
    console.warn(`[import] could not record the request: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/**
 * The runner's side: one tracker per run. Every change is written in order, at most one write at a time; the last
 * state always lands. A failed write is logged and never fails the collection.
 */
export class LiveRunTracker {
  private run: LiveRun;
  private chain: Promise<void> = Promise.resolve();
  private names = new Map<string, string>();
  private dirty = false;
  private writing = false;

  constructor(input: { mode: LiveRunMode; module?: string; by: string; runUrl?: string }, private store = stateStore, now = new Date()) {
    const at = now.toISOString();
    this.run = {
      id: `live_${now.getTime().toString(36)}`,
      mode: input.mode,
      ...(input.module ? { module: input.module } : {}),
      by: input.by,
      state: "running",
      step: "starting",
      steps: ["starting"],
      startedAt: at,
      updatedAt: at,
      sources: [],
      refresh: { modules: [], done: {} },
      ...(input.runUrl ? { runUrl: input.runUrl } : {}),
    };
  }

  get current(): LiveRun {
    return this.run;
  }

  setNames(names: Map<string, string>) {
    this.names = names;
  }

  /** Starts the run; an Import now press is taken off the queue when this run is the one it asked for. */
  start(): Promise<void> {
    return this.write(true);
  }

  step(step: LiveRunStep) {
    this.change((r) => atStep(r, step));
  }

  progress = (e: CollectProgress) => {
    this.change((r) => applyProgress(r, e, this.names));
  };

  refreshStart(modules: string[]) {
    this.change((r) => refreshing(r, modules));
  }

  refreshModule = (module: string, stored: number | null, next?: string) => {
    this.change((r) => refreshedModule(r, module, stored, next));
  };

  finish(ok: boolean, summary: string): Promise<void> {
    const at = new Date().toISOString();
    this.run = { ...atStep(this.run, "done"), state: ok ? "done" : "failed", finishedAt: at, summary: summary.slice(0, 400) };
    return this.flush();
  }

  /** Waits until everything changed so far is written. */
  async flush(): Promise<void> {
    this.dirty = true;
    await this.write(false);
  }

  private change(fn: (r: LiveRun) => LiveRun) {
    this.run = fn(this.run);
    this.dirty = true;
    void this.write(false);
  }

  private write(starting: boolean): Promise<void> {
    if (!starting && this.writing) return this.chain;
    this.writing = true;
    this.chain = this.chain.then(async () => {
      while (this.dirty || starting) {
        this.dirty = false;
        const run = { ...this.run, updatedAt: new Date().toISOString() };
        try {
          const d = ((await this.store.get(PLATFORM_TENANT, KEY))?.state ?? {}) as LiveDoc;
          // The press this run answers (not a scheduled run's: a press waits for the run after it).
          const request = starting && run.mode !== "scheduled" ? undefined : d.request;
          await this.store.put(PLATFORM_TENANT, KEY, { ...(request ? { request } : {}), run });
        } catch (e) {
          console.warn(`[gateway-runner] could not record progress: ${e instanceof Error ? e.message : "unknown"}`);
        }
        starting = false;
      }
      this.writing = false;
    });
    return this.chain;
  }
}
