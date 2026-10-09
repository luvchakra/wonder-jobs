/**
 * The JobsLake search cache, server side: hashed keys, one batched read per search, writes after it,
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
export async function lookupAnswers(sources: Pick<SourceRecord, "id" | "updatedAt">[], depth: Depth, criteria: { query: string; locations: string[] }, now = Date.now()): Promise<CacheLookup> {
  const search = searchKey(criteria);
  const keyOwner = new Map<string, string>();
  for (const s of sources) for (const d of servingDepths(depth)) keyOwner.set(answerKey(s, d, search), s.id);
  const entries = await jobsLakeStore().getCachedAnswers([...keyOwner.keys()]);
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

/** Stores this search's fresh answers; at most every 10 minutes per server, drops ones too old to serve. */
export async function saveAnswers(entries: CachedAnswer[], now = Date.now()): Promise<void> {
  const store = jobsLakeStore();
  if (entries.length) await store.putCachedAnswers(entries);
  if (!g.__jlCachePrunedAt || now - g.__jlCachePrunedAt > 10 * 60_000) {
    g.__jlCachePrunedAt = now;
    await store.pruneCachedAnswers(new Date(now - STALE_MS).toISOString());
  }
}
