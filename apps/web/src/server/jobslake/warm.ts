/**
 * The one step that brings gateway-collected listings into Find, for every module (owner, 2026-11-02: "after the job
 * completes, it should also update the cache so ALL new entries appear for all the modules"; "no duplicate jobs ... no
 * duplicate entries"). Called only by jobs: when Setup's job finishes, after the weekly OpenStreetMap delivery, and after
 * a gateway collection that found something. It
 *  - stores each module's gateway listings in WorksLake's store (the warm pool a search without words shows), all of a
 *    module's gateway-fed sources canonicalised together, so a listing two sources carry is stored once;
 *  - retires every cached answer from a gateway-fed source (a newer refresh stamp is part of their cache key), so a
 *    worded search asks again and sees the new entries.
 * Reads only data WonderWorks already collected, with no words; never an outside site, never per user search.
 */
import { canonicalize, type Observation } from "@/domain/jobslake/canonical";
import { validateOpportunity } from "@/domain/jobslake/protocol";
import { placeWithCountry } from "@/domain/jobslake/country";
import { MODULES, type ModuleId } from "@/modules/registry";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { loadScheduler } from "@/server/scheduler/store";
import { gatewayModuleForSource } from "./gatewaySources";
import { isAvailable, listSources, runConnector } from "./registry";
import { jobsLakeStore } from "./store";
import { randomBytes } from "node:crypto";
import type { SourceRun } from "@/domain/jobslake/health";
import type { SourceRecord } from "./types";

export interface GatewayRefresh {
  at: string;
  /** Listings stored per module. */
  stored: Record<string, number>;
  /** Sources that couldn't be read, with why. */
  failed: { sourceId: string; error: string }[];
}

const KEY = "wj.gatewayrefresh" as const;
/**
 * How many of a module's gateway listings one refresh stores (owner, 2026-11-05: "even after so many new sources, don't
 * see many additions"). The gateway answered one page of 100, so Find held at most 100 per module however much was
 * collected; it now reads page after page up to this many (the warm pool reads up to 3,000 per module).
 */
export const REFRESH_MAX = 1000;

/** A source whose listings are the data gateway's: read in process (`liveRead`) or through its API (WWDG). */
export const isGatewayFed = (s: Pick<SourceRecord, "id" | "liveRead">) => !!s.liveRead || !!gatewayModuleForSource(s.id);

const g = globalThis as unknown as { __wjGatewayStamp?: { at?: string; readAt: number } };

/** When gateway listings were last refreshed (memoised for a minute per server). */
export async function gatewayRefreshStamp(now = Date.now()): Promise<string | undefined> {
  if (g.__wjGatewayStamp && now - g.__wjGatewayStamp.readAt < 60_000) return g.__wjGatewayStamp.at;
  const at = ((await stateStore.get(PLATFORM_TENANT, KEY))?.state as GatewayRefresh | undefined)?.at;
  g.__wjGatewayStamp = { at, readAt: now };
  return at;
}

export async function lastGatewayRefresh(): Promise<GatewayRefresh | null> {
  return ((await stateStore.get(PLATFORM_TENANT, KEY))?.state as GatewayRefresh | undefined) ?? null;
}

/**
 * Refreshes these modules (every module when none are named): stores their gateway listings and retires the cached
 * answers. One source's failure doesn't stop the rest; it's reported.
 */
export async function refreshGatewayListings(modules?: Iterable<string>, now = new Date()): Promise<GatewayRefresh> {
  const result: GatewayRefresh = { at: now.toISOString(), stored: {}, failed: [] };
  // A module whose import is paused (Sources → Import) keeps what Find has; nothing new is stored for it.
  const paused = new Set((await loadScheduler()).gateway.pausedModules);
  for (const mod of new Set(modules ?? MODULES.map((m) => m.id))) {
    if (paused.has(mod)) continue;
    const sources = (await listSources(mod as ModuleId)).filter((s) => isGatewayFed(s) && (s.status === "active" || s.status === "degraded"));
    const observations: Observation[] = [];
    // Each source's read is recorded as a "refresh" run, so Overview and Runs count what the job fetched.
    const runs: SourceRun[] = [];
    for (const s of sources) {
      const started = Date.now();
      const base = { id: `run_${randomBytes(9).toString("base64url")}`, sourceId: s.id, trigger: "refresh" as const, startedAt: new Date(started).toISOString(), duplicates: 0 };
      try {
        if (!(await isAvailable(s))) continue;
        const r = await runConnector(s, { query: "", locations: [], maxResults: REFRESH_MAX }, "shallow");
        const jobs = placeWithCountry(r.jobs, s.geography);
        for (const job of jobs) observations.push({ source: s, job });
        runs.push({ ...base, durationMs: Date.now() - started, outcome: jobs.length ? "ok" : "empty", retrieved: jobs.length, valid: jobs.length });
      } catch (e) {
        const message = e instanceof Error ? e.message.slice(0, 200) : String(e);
        result.failed.push({ sourceId: s.id, error: message });
        runs.push({ ...base, durationMs: Date.now() - started, outcome: "unavailable", retrieved: 0, valid: 0, message });
      }
    }
    if (runs.length) await jobsLakeStore().recordRuns(runs).catch(() => undefined);
    if (!sources.length) continue;
    const opps = canonicalize(observations).opportunities.filter((o) => validateOpportunity(o).length === 0);
    if (opps.length) await jobsLakeStore().upsertOpportunities(opps, mod as ModuleId);
    result.stored[mod] = opps.length;
  }
  // The new stamp retires every gateway-fed source's cached answers (core.ts keys them with it).
  await stateStore.put(PLATFORM_TENANT, KEY, result);
  g.__wjGatewayStamp = { at: result.at, readAt: Date.now() };
  return result;
}
