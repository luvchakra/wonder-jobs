/**
 * The WorksLake search cache, server side: hashed keys, one batched read per search, writes after it,
 * and pruning. The rules (what counts as the same search, how long an answer is good for) are in
 * `domain/jobslake/cache.ts`; `core.search` decides when to use an answer.
 *
 * A key is a hash of the source, its config version (`updatedAt` — editing a source retires its
 * answers), the depth, and the normalized search — so the table holds no query text.
 */
import { createHash } from "node:crypto";
import type { Job } from "@/domain/jobs/types";
import { pickEntry, searchKey, servingDepths, STALE_MS } from "@/domain/jobslake/cache";
import type { Depth } from "@/domain/jobslake/planner";
import { jobsLakeStore, type CachedAnswer } from "./store";
import type { SourceRecord } from "./types";
import type { ModuleId } from "@/wonderworks/manifest";

export function answerKey(src: Pick<SourceRecord, "id" | "updatedAt">, depth: Depth, search: string): string {
  return createHash("sha256").update(`${src.id}|${src.updatedAt}|${depth}|${search}`).digest("hex").slice(0, 40);
}

export interface CacheLookup {
  /** The newest fresh answer per source, if any. */
  fresh: Map<string, CachedAnswer>;
  /** The newest answer per source that may still stand in when the source fails now. */
  fallback: Map<string, CachedAnswer>;
}

/** Every planned source's cached answers for this search, in one read. */
export async function lookupAnswers(sources: Pick<SourceRecord, "id" | "updatedAt">[], depth: Depth, criteria: { query: string; locations: string[] }, now = Date.now(), module: ModuleId = "jobs"): Promise<CacheLookup> {
  const search = searchKey(criteria);
  const keyOwner = new Map<string, string>();
  for (const s of sources) for (const d of servingDepths(depth)) keyOwner.set(answerKey(s, d, search), s.id);
  const entries = await jobsLakeStore().getCachedAnswers([...keyOwner.keys()], module);
  const bySource = new Map<string, CachedAnswer[]>();
  for (const e of entries) {
    const owner = keyOwner.get(e.key);
    if (owner) bySource.set(owner, [...(bySource.get(owner) ?? []), e]);
  }
  const fresh = new Map<string, CachedAnswer>();
  const fallback = new Map<string, CachedAnswer>();
  for (const [id, list] of bySource) {
    const f = pickEntry(list, now, false);
    if (f) fresh.set(id, f);
    const s = pickEntry(list, now, true);
    if (s) fallback.set(id, s);
  }
  return { fresh, fallback };
}

export function answerFor(src: Pick<SourceRecord, "id" | "updatedAt">, depth: Depth, criteria: { query: string; locations: string[] }, r: { jobs: Job[]; warnings: string[] }, fetchedAt: string): CachedAnswer {
  return { key: answerKey(src, depth, searchKey(criteria)), sourceId: src.id, depth, jobs: r.jobs, retrieved: r.jobs.length, warnings: r.warnings.slice(0, 5), fetchedAt };
}

const g = globalThis as unknown as { __jlCachePrunedAt?: number };
const PRUNE_EVERY_MS = 60 * 60_000;

/** Stores this search's fresh answers. */
export async function saveAnswers(entries: CachedAnswer[], module: ModuleId = "jobs"): Promise<void> {
  if (entries.length) await jobsLakeStore().putCachedAnswers(entries, module);
}

/**
 * Drops answers too old to serve, at most once an hour per server (it took 5.8 to 8.7 s after the response when it ran
 * every 10 minutes; an answer too old to serve is never read anyway, so nothing waits on this). It is a delete across every data database
 * (7.4 s on a cold instance, measured 2026-11-21, when the search itself waited on it), so a search never waits for it:
 * the caller runs the returned work after the response is sent. Null when it isn't due.
 */
export function pruneAnswersIfDue(now = Date.now()): (() => Promise<void>) | null {
  if (g.__jlCachePrunedAt && now - g.__jlCachePrunedAt <= PRUNE_EVERY_MS) return null;
  g.__jlCachePrunedAt = now;
  return async () => {
    await jobsLakeStore().pruneCachedAnswers(new Date(now - STALE_MS).toISOString());
  };
}
