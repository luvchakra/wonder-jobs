/**
 * Admin → Databases (owner, 2026-11-01): usage and performance of the application database (ADB, accounts, saves,
 * applications, settings) and the optional data database (DDB, WorksLake's listings, search cache, H-1B data and
 * gateway listings; dataDb). For each: size, plan limit, headroom, largest tables, a timed round trip, connections,
 * cache hit rate, the longest running query, rollbacks/deadlocks, the slowest statements (db_usage / db_health,
 * migrations 0047/0048 and the DDB setup script), and what the app's safeguards (dbGuard) are doing. Read-only.
 */
import { getSupabaseAdmin, type AdminClient } from "./supabase";
import { dbGuard } from "./dbGuard";
import { isLegacyKey, moduleDataDbs, tablesFor } from "./dataDb";
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
  id: "adb" | `ddb:${string}`;
  name: string;
  holds: string;
  /** The modules whose listings it holds, shown on the card (owner, 2026-11-05: "show the shared modules together"). */
  modules?: string[];
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
  /** Which of its keys are legacy JWT keys, retired at the end of 2026 (never the keys themselves). */
  legacyKeys?: string[];
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
  // A data database set up before db_health() existed (the setup script gained it with the Databases page): say how to
  // add it, not the database's own words.
  const missing = (e: { message: string } | null) => !!e && /schema cache|does not exist|PGRST202/i.test(e.message);
  const rerun = "Run the setup script again in the DDB (Sources → DDBs → Setup script → Copy script → its SQL editor → Run; safe to re-run).";
  const error = probe.error?.message ?? (missing(u.error) ? `Size unavailable. ${rerun}` : u.error?.message) ?? (h.error ? (missing(h.error) ? `Performance figures unavailable. ${rerun}` : `Performance figures unavailable: ${h.error.message}`) : undefined);
  return { usage: (u.data as { db_bytes: number; tables?: DbReport["tables"] } | null) ?? null, raw: (h.data as Raw | null) ?? null, ms, error };
}

export async function databasesReport(labels: Record<string, string> = {}): Promise<{ adb: DbReport; modules: DbReport[] }> {
  const { settings } = await loadSafeguards();
  const main = getSupabaseAdmin();
  // Each module's own data database (owner, 2026-11-03), each on the data databases' plan size.
  const mods = await moduleDataDbs();
  const adbBase = { id: "adb" as const, name: "Application database (ADB)", holds: `Accounts, saves, applications, settings and the gateway's configuration${mods.length < Object.keys(labels).length ? `, and the listings of ${Object.keys(labels).filter((k) => !mods.some((m) => m.module === k)).map((k) => labels[k]).join(", ")}` : ""}.`, configured: !!main, limitMb: settings.limitMb, guard: dbGuard.state() };
  const adb = await (main ? measure(main, "tenants").then((m) => shapeReport(adbBase, m.usage, m.raw, m.ms, m.error)).catch((e) => shapeReport(adbBase, null, null, null, e instanceof Error ? e.message : String(e))) : Promise.resolve(shapeReport(adbBase, null, null, null, "No database is configured on this deployment.")));
  // Modules that share one database (the same project URL) are one card with every module named (owner, 2026-11-05:
  // "show the shared modules together"); it was a card per module with the same figures repeated.
  const groups = new Map<string, typeof mods>();
  for (const m of mods) groups.set(m.url, [...(groups.get(m.url) ?? []), m]);
  const modules = await Promise.all(
    [...groups.values()].map((group) => {
      const names = group.map((m) => labels[m.module] ?? m.module);
      const tables = [...new Set(group.flatMap((m) => tablesFor(m.module)))].map((t) => t.replace(/_/g, " ")).join(", ");
      const id = `ddb:${group.map((m) => m.module).join("+")}` as const;
      const base = { id, name: `${names.join(" · ")} DDB`, holds: group.length > 1 ? `Shared by ${names.length} modules (${names.join(", ")}): their ${tables} and search cache, each module's kept apart.` : `${names[0]} only: its ${tables} and search cache.`, configured: true, limitMb: settings.dataLimitMb, guard: group[0].guard };
      return measure(group[0].client, "gateway_listings")
        .then((r) => shapeReport(base, r.usage, r.raw, r.ms, r.error))
        .catch((e) => shapeReport(base, null, null, null, e instanceof Error ? e.message : String(e)))
        .then((rep) => ({ ...rep, modules: names, ...(group.some((m) => m.legacy) ? { legacyKeys: ["secret key"] } : {}) }));
    }),
  );
  // The main project's keys, checked here on the server; only whether each is legacy leaves it.
  const adbLegacy = [isLegacyKey(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY) ? "SUPABASE_SERVICE_ROLE_KEY" : null, isLegacyKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : null].filter((k): k is string => !!k);
  if (adbLegacy.length) adb.legacyKeys = adbLegacy;
  adb.modules = Object.keys(labels).filter((k) => !mods.some((m) => m.module === k)).map((k) => labels[k]);
  return { adb, modules };
}
