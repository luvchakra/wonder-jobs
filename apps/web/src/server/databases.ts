/**
 * Admin → Databases (owner, 2026-11-01): usage and performance of the application database (ADB, accounts, saves,
 * applications, settings) and the optional data database (DDB, WorksLake's listings, search cache, H-1B data and
 * gateway listings; dataDb). For each: size, plan limit, headroom, largest tables, a timed round trip, connections,
 * cache hit rate, the longest running query, rollbacks/deadlocks, the slowest statements (db_usage / db_health,
 * migrations 0047/0048 and the DDB setup script), and what the app's safeguards (dbGuard) are doing. Read-only.
 */
import { getSupabaseAdmin, type AdminClient } from "./supabase";
import { dbGuard } from "./dbGuard";
import { dataDbNow, DATA_TABLES } from "./dataDb";
import { loadSafeguards } from "./jobslake/safeguards";

export interface DbHealth {
  connections: { active: number; idle: number; total: number; max: number };
  longestQuerySec: number;
  cacheHitPct: number | null;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  startedAt: string | null;
  slowQueries: { query: string; calls: number; meanMs: number; totalMs: number }[];
}

export interface DbReport {
  id: "adb" | "ddb";
  name: string;
  holds: string;
  /** False for a DDB that isn't set up (its data is in the ADB). */
  configured: boolean;
  sizeBytes: number | null;
  limitMb: number;
  /** Share of the limit used, 0–100. */
  percent: number | null;
  headroomBytes: number | null;
  tables: { name: string; rows: number; bytes: number }[];
  /** A small read, timed from this server: what a page waits for each query. */
  roundTripMs: number | null;
  health: DbHealth | null;
  guard: { active: number; waiting: number; failures: number; open: boolean; refusedBusy: number; refusedBreaker: number; timedOut: number };
  error?: string;
}

type Raw = { connections: DbHealth["connections"]; longest_query_sec: number; cache_hit_pct: number | null; commits: number; rollbacks: number; deadlocks: number; started_at: string | null; slow_queries: { query: string; calls: number; mean_ms: number; total_ms: number }[] };

/** Pure: the database's numbers from its two functions' answers (exported for tests). */
export function shapeReport(base: Pick<DbReport, "id" | "name" | "holds" | "configured" | "limitMb" | "guard">, usage: { db_bytes: number; tables?: DbReport["tables"] } | null, raw: Raw | null, roundTripMs: number | null, error?: string): DbReport {
  const size = usage ? Number(usage.db_bytes) : null;
  const limit = base.limitMb * 1048576;
  return {
    ...base,
    sizeBytes: size,
    percent: size == null ? null : Math.round((size / limit) * 1000) / 10,
    headroomBytes: size == null ? null : Math.max(0, limit - size),
    tables: usage?.tables ?? [],
    roundTripMs,
    health: raw
      ? {
          connections: raw.connections,
          longestQuerySec: Number(raw.longest_query_sec ?? 0),
          cacheHitPct: raw.cache_hit_pct == null ? null : Number(raw.cache_hit_pct),
          commits: Number(raw.commits ?? 0),
          rollbacks: Number(raw.rollbacks ?? 0),
          deadlocks: Number(raw.deadlocks ?? 0),
          startedAt: raw.started_at,
          slowQueries: (raw.slow_queries ?? []).map((q) => ({ query: q.query, calls: Number(q.calls), meanMs: Number(q.mean_ms), totalMs: Number(q.total_ms) })),
        }
      : null,
    ...(error ? { error } : {}),
  };
}

async function measure(c: AdminClient, probeTable: string): Promise<{ usage: { db_bytes: number; tables?: DbReport["tables"] } | null; raw: Raw | null; ms: number | null; error?: string }> {
  const t0 = Date.now();
  const probe = await c.from(probeTable).select("*", { count: "exact", head: true }).limit(1);
  const ms = probe.error ? null : Date.now() - t0;
  const [u, h] = await Promise.all([c.rpc("db_usage"), c.rpc("db_health")]);
  const error = probe.error?.message ?? u.error?.message ?? (h.error ? `Performance figures unavailable: ${h.error.message}` : undefined);
  return { usage: (u.data as { db_bytes: number; tables?: DbReport["tables"] } | null) ?? null, raw: (h.data as Raw | null) ?? null, ms, error };
}

export async function databasesReport(): Promise<{ adb: DbReport; ddb: DbReport }> {
  const { settings } = await loadSafeguards();
  const main = getSupabaseAdmin();
  const data = await dataDbNow();
  const adbBase = { id: "adb" as const, name: "Application database (ADB)", holds: data ? "Accounts, saves, applications, settings and the gateway's configuration." : "Everything: the app's data and, with no data database switched on, WorksLake's data too.", configured: !!main, limitMb: settings.limitMb, guard: dbGuard.state() };
  const ddbBase = { id: "ddb" as const, name: "Data database (DDB)", holds: `WorksLake's ${DATA_TABLES.map((t) => t.replace(/_/g, " ")).join(", ")}.`, configured: !!data, limitMb: settings.dataLimitMb, guard: data?.guard ?? { active: 0, waiting: 0, failures: 0, open: false, refusedBusy: 0, refusedBreaker: 0, timedOut: 0 } };
  const [adb, ddb] = await Promise.all([
    main ? measure(main, "tenants").then((m) => shapeReport(adbBase, m.usage, m.raw, m.ms, m.error)).catch((e) => shapeReport(adbBase, null, null, null, e instanceof Error ? e.message : String(e))) : Promise.resolve(shapeReport(adbBase, null, null, null, "No database is configured on this deployment.")),
    data ? measure(data.client, "gateway_listings").then((m) => shapeReport(ddbBase, m.usage, m.raw, m.ms, m.error)).catch((e) => shapeReport(ddbBase, null, null, null, e instanceof Error ? e.message : String(e))) : Promise.resolve(shapeReport(ddbBase, null, null, null)),
  ]);
  return { adb, ddb };
}
