/**
 * Admin → Keys' play button (owner, 2026-11-22: "add a play button ... to run the associated job just related to that
 * key, if already running, add option to stop the job. if multiple keys make up a single source of data then show them
 * in a way that shows they belong together and show a common play button").
 *
 * A key family is the keys one provider needs together (KEY_FAMILIES: Adzuna's ID and key, USAJOBS' key and email…).
 * Its run reads every source that uses it, in every module (Adzuna: Jobs India, Internships, Teaching…), the way the
 * scheduled refresh reads a source: no words, the newest listings, stored in that module's WorksLake listings and
 * recorded as a run. One run per family at a time; Stop ends it before its next source. Never per user search, never
 * shown a key's value.
 */
import { canonicalize, type Observation } from "@/domain/jobslake/canonical";
import { placeWithCountry } from "@/domain/jobslake/country";
import type { SourceRun } from "@/domain/jobslake/health";
import { validateOpportunity } from "@/domain/jobslake/protocol";
import { MODULES, type ModuleId } from "@/modules/registry";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { randomBytes } from "node:crypto";
import { KEY_FAMILIES } from "./keyTest";
import { isAvailable, listSources, runConnector } from "./registry";
import { jobsLakeStore } from "./store";
import type { SourceRecord } from "./types";

export interface KeyRunItem {
  sourceId: string;
  module: string;
  name: string;
  status: "pending" | "running" | "ok" | "empty" | "failed" | "skipped";
  retrieved?: number;
  message?: string;
}
export interface KeyRun {
  family: string;
  by: string;
  startedAt: string;
  finishedAt?: string;
  /** Pressed Stop: the run ends before its next source. */
  stopRequested?: boolean;
  status: "running" | "done" | "stopped" | "failed";
  items: KeyRunItem[];
  /** Listings stored, across its modules. */
  stored?: number;
  workedAt?: string;
}
export interface KeyFamily {
  id: string;
  title: string;
  keys: string[];
  /** The sources that use it, by module: what Play runs. */
  sources: { id: string; module: string; name: string }[];
}

const STORE = "wj.keyruns" as const;
/** One server call: start no new source after this, so the call ends inside its 60 s. */
export const RUN_BUDGET_MS = 40_000;
/** A run with no progress this long was cut off (its server call ended): it shows as stopped. */
export const STALE_MS = 3 * 60_000;
const MAX_RESULTS = 200;

/** The provider's name from its keys' labels: "Adzuna app ID" → "Adzuna". */
const titleOf = (labels: string[]) => (labels[0] ?? "").replace(/\s+(app id|app key|api key|api token|email|client id|client secret|username|affiliate id|affiliate token|token|appname|\(optional\)).*$/i, "").trim() || labels[0] || "";

const usesFamily = (sourceId: string, family: string) => sourceId === family || sourceId.split("_").includes(family);

/** Every key family that some source uses, with its sources, for the keys page. */
export async function keyFamilies(labels: Record<string, string>): Promise<KeyFamily[]> {
  const all: { s: SourceRecord; module: string }[] = [];
  for (const m of MODULES) for (const s of await listSources(m.id as ModuleId)) all.push({ s, module: m.id });
  return KEY_FAMILIES.map((f) => ({
    id: f.id,
    title: titleOf(f.needs.map((k) => labels[k] ?? k)),
    keys: f.needs,
    sources: all.filter((x) => x.s.config.kind === "builtin" && usesFamily(x.s.id, f.id)).map((x) => ({ id: x.s.id, module: x.module, name: String(x.s.name ?? x.s.id) })),
  })).filter((f) => f.sources.length);
}

async function readRuns(): Promise<Record<string, KeyRun>> {
  return ((await stateStore.get(PLATFORM_TENANT, STORE))?.state as Record<string, KeyRun> | undefined) ?? {};
}
async function saveRun(run: KeyRun): Promise<void> {
  const all = await readRuns();
  run.workedAt = new Date().toISOString();
  await stateStore.put(PLATFORM_TENANT, STORE, { ...all, [run.family]: run });
}

/** Each family's last run; one still "running" with no progress for STALE_MS shows as stopped. */
export async function keyRuns(now = Date.now()): Promise<Record<string, KeyRun>> {
  const all = await readRuns();
  for (const r of Object.values(all)) if (r.status === "running" && now - Date.parse(r.workedAt ?? r.startedAt) > STALE_MS) Object.assign(r, { status: "stopped", finishedAt: r.workedAt ?? r.startedAt });
  return all;
}

/** Queue a family's run; the caller does the work (`runKeyFamily`) after answering. */
export async function startKeyRun(family: string, by: string, labels: Record<string, string>): Promise<{ ok: true; run: KeyRun } | { ok: false; message: string }> {
  const f = (await keyFamilies(labels)).find((x) => x.id === family);
  if (!f) return { ok: false, message: "No source uses this key." };
  const current = (await keyRuns())[family];
  if (current?.status === "running") return { ok: false, message: "It's already running." };
  const run: KeyRun = { family, by, startedAt: new Date().toISOString(), status: "running", items: f.sources.map((s) => ({ sourceId: s.id, module: s.module, name: s.name, status: "pending" })) };
  await saveRun(run);
  return { ok: true, run };
}

/** Stop a family's run before its next source. */
export async function stopKeyRun(family: string): Promise<{ ok: boolean; message: string }> {
  const run = (await readRuns())[family];
  if (!run || run.status !== "running") return { ok: false, message: "It isn't running." };
  await saveRun({ ...run, stopRequested: true });
  return { ok: true, message: "Stopping after the source it's reading now." };
}

/** Do the run: each source in turn, its listings stored in its module, until done, stopped, or out of time. */
export async function runKeyFamily(family: string, deps: { now?: () => number; budgetMs?: number } = {}): Promise<KeyRun | null> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? RUN_BUDGET_MS;
  let run = (await readRuns())[family];
  if (!run || run.status !== "running") return run ?? null;
  const store = jobsLakeStore();
  let stored = 0;
  for (const item of run.items) {
    if (item.status !== "pending") continue;
    run = { ...(await readRuns())[family]!, items: run.items };
    if (run.stopRequested || now() - started > budget) {
      for (const i of run.items) if (i.status === "pending") Object.assign(i, { status: "skipped", message: run.stopRequested ? "Stopped" : "Out of time: press play again" });
      break;
    }
    item.status = "running";
    await saveRun(run);
    const s = (await listSources(item.module as ModuleId)).find((x) => x.id === item.sourceId);
    const t0 = now();
    const base = { id: `run_${randomBytes(9).toString("base64url")}`, sourceId: item.sourceId, trigger: "refresh" as const, startedAt: new Date(t0).toISOString(), duplicates: 0 };
    try {
      if (!s || !(await isAvailable(s))) {
        Object.assign(item, { status: "failed", message: "Needs setup" });
      } else {
        const r = await runConnector(s, { query: "", locations: [], maxResults: MAX_RESULTS }, "shallow");
        const jobs = placeWithCountry(r.jobs, s.geography);
        const observations: Observation[] = jobs.map((job) => ({ source: s, job }));
        const opps = canonicalize(observations).opportunities.filter((o) => validateOpportunity(o).length === 0);
        if (opps.length) await store.upsertOpportunities(opps, item.module as ModuleId);
        stored += opps.length;
        Object.assign(item, { status: jobs.length ? "ok" : "empty", retrieved: jobs.length });
        await store.recordRuns([{ ...base, durationMs: now() - t0, outcome: jobs.length ? "ok" : "empty", retrieved: jobs.length, valid: opps.length } as SourceRun]).catch(() => undefined);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 160) : "Failed";
      Object.assign(item, { status: "failed", message });
      await store.recordRuns([{ ...base, durationMs: now() - t0, outcome: "unavailable", retrieved: 0, valid: 0, message } as SourceRun]).catch(() => undefined);
    }
    await saveRun(run);
  }
  const latest = (await readRuns())[family]!;
  const items = run.items;
  const stopped = latest.stopRequested || items.some((i) => i.status === "skipped");
  const final: KeyRun = { ...latest, items, stored: (latest.stored ?? 0) + stored, status: items.every((i) => i.status === "failed") ? "failed" : stopped ? "stopped" : "done", finishedAt: new Date(now()).toISOString() };
  await saveRun(final);
  return final;
}
