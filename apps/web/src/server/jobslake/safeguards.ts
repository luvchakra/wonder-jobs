import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { getSupabaseAdmin } from "@/server/supabase";
import { dataFrom, loadDataDb, type DataTable } from "@/server/dataDb";
import { MODULE_IDS } from "@/modules/registry";

/**
 * Storage safeguards (owner, 2026-11-01: "build the safeguards ... give the safeguards parameter adjustment fine tune
 * option in admin"). The free database stops taking writes at 500 MB, so a daily pass in the scheduled-runs cron:
 *  1. removes WorksLake listings no source has shown for `staleDays`, except any a person saved or responded to;
 *  2. keeps each gateway source to `gatewayMaxPerSource` listings (newest kept) and no listing older than `gatewayMaxAgeDays`;
 *  3. measures the database against `limitMb` and alerts on Admin → Overview past `alertPercent`.
 * Every number is the admin's (Settings → Storage); `enabled` false stops the deleting, never the measuring.
 */
export interface SafeguardSettings {
  enabled: boolean;
  staleDays: number;
  gatewayMaxPerSource: number;
  gatewayMaxAgeDays: number;
  limitMb: number;
  alertPercent: number;
  /** At most this many rows deleted in one pass, so a first run never stalls the cron. */
  maxDeletesPerRun: number;
}

export const SAFEGUARD_DEFAULTS: SafeguardSettings = { enabled: true, staleDays: 21, gatewayMaxPerSource: 5000, gatewayMaxAgeDays: 21, limitMb: 500, alertPercent: 70, maxDeletesPerRun: 5000 };

/** The allowed range of each number; anything outside is clamped. */
export const SAFEGUARD_RANGES: Record<Exclude<keyof SafeguardSettings, "enabled">, [number, number]> = {
  staleDays: [3, 365],
  gatewayMaxPerSource: [100, 200000],
  gatewayMaxAgeDays: [1, 365],
  limitMb: [100, 1000000],
  alertPercent: [10, 99],
  maxDeletesPerRun: [100, 100000],
};

export interface SafeguardRun {
  at: string;
  opportunitiesDeleted: number;
  opportunitiesKept: number;
  gatewayDeleted: number;
  dbBytes: number | null;
  error?: string;
}

const KEY = "wj.dbsafeguards" as const;
type Doc = { settings?: Partial<SafeguardSettings>; lastRun?: SafeguardRun };

export function cleanSafeguards(raw: Partial<SafeguardSettings> | undefined): SafeguardSettings {
  const out = { ...SAFEGUARD_DEFAULTS };
  if (typeof raw?.enabled === "boolean") out.enabled = raw.enabled;
  for (const [k, [lo, hi]] of Object.entries(SAFEGUARD_RANGES) as [keyof typeof SAFEGUARD_RANGES, [number, number]][]) {
    const v = Number(raw?.[k]);
    if (Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, Math.round(v)));
  }
  return out;
}

async function readDoc(): Promise<Doc> {
  return ((await stateStore.get(PLATFORM_TENANT, KEY))?.state as Doc | undefined) ?? {};
}

export async function loadSafeguards(): Promise<{ settings: SafeguardSettings; lastRun: SafeguardRun | null }> {
  const d = await readDoc();
  return { settings: cleanSafeguards(d.settings), lastRun: d.lastRun ?? null };
}

export async function saveSafeguards(patch: Partial<SafeguardSettings>): Promise<SafeguardSettings> {
  const d = await readDoc();
  const settings = cleanSafeguards({ ...d.settings, ...patch });
  await stateStore.put(PLATFORM_TENANT, KEY, { ...d, settings });
  return settings;
}

/** The database's size and largest tables (migration 0047); null where the database can't say. */
export async function dbUsage(): Promise<{ dbBytes: number; tables: { name: string; rows: number; bytes: number }[] } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.rpc("db_usage");
  if (error || !data) return null;
  const d = data as { db_bytes: number; tables: { name: string; rows: number; bytes: number }[] };
  return { dbBytes: Number(d.db_bytes), tables: d.tables ?? [] };
}

/** Pure: whether usage is past the alert line, and the share used. */
export function usageLevel(dbBytes: number, s: Pick<SafeguardSettings, "limitMb" | "alertPercent">): { percent: number; alert: boolean } {
  const percent = Math.round((dbBytes / (s.limitMb * 1024 * 1024)) * 1000) / 10;
  return { percent, alert: percent >= s.alertPercent };
}

/**
 * Pure: the stale listings that may go. A listing stays when anyone saved or responded to it: by its own id, its id
 * without the module prefix, or a legacy WonderWorks job id one of its source records carries.
 */
export function deletable(rows: { id: string; legacy?: unknown }[], keep: Set<string>): string[] {
  return rows
    .filter((r) => {
      const bare = r.id.includes(":") ? r.id.slice(r.id.indexOf(":") + 1) : r.id;
      if (keep.has(r.id) || keep.has(bare)) return false;
      const legacy = Array.isArray(r.legacy) ? r.legacy.map((x) => (x && typeof x === "object" ? (x as { legacyJobId?: unknown }).legacyJobId : undefined)) : [];
      return !legacy.some((l) => typeof l === "string" && keep.has(l));
    })
    .map((r) => r.id);
}

/** Every listing id any person saved, applied to or responded to, across Jobs and every module's store. */
async function referencedIds(): Promise<Set<string>> {
  const sb = getSupabaseAdmin()!;
  const keep = new Set<string>();
  const stores = ["wj.jobs", "wj.applications", ...MODULE_IDS.filter((m) => m !== "jobs").map((m) => `wj.m.${m}`)];
  const add = (o: unknown) => {
    if (o && typeof o === "object") for (const k of Object.keys(o)) keep.add(k);
  };
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb.from("app_state").select("store, saved:state->state->saved, responses:state->state->responses, apps:state->state->applications").in("store", stores).range(from, from + 499);
    if (error) throw new Error(`couldn't read saved listings: ${error.message}`);
    for (const r of data ?? []) {
      add(r.saved);
      add(r.responses);
      if (r.apps && typeof r.apps === "object")
        for (const a of Object.values(r.apps as Record<string, unknown>)) {
          const job = (a as { jobId?: unknown })?.jobId;
          if (typeof job === "string") keep.add(job);
        }
    }
    if (!data || data.length < 500) break;
  }
  return keep;
}

/** The daily pass. Measures always; deletes only when enabled, and never more than maxDeletesPerRun. */
export async function runSafeguards(now = new Date()): Promise<SafeguardRun> {
  const { settings } = await loadSafeguards();
  const run: SafeguardRun = { at: now.toISOString(), opportunitiesDeleted: 0, opportunitiesKept: 0, gatewayDeleted: 0, dbBytes: null };
  const sb = getSupabaseAdmin();
  try {
    if (sb && settings.enabled) {
      // The listings may be in the optional data database (dataDb); saves and applications stay in the main one.
      await loadDataDb();
      const data = (t: DataTable) => dataFrom(t)!;
      let budget = settings.maxDeletesPerRun;
      // 1. Stale WorksLake listings, except those someone kept.
      const keep = await referencedIds();
      const cutoff = new Date(now.getTime() - settings.staleDays * 86_400_000).toISOString();
      const { data: stale, error } = await data("jobslake_opportunities").select("id, legacy:data->sourceRecords").lt("last_observed_at", cutoff).order("last_observed_at", { ascending: true }).limit(budget);
      if (error) throw new Error(`couldn't list stale listings: ${error.message}`);
      const ids = deletable((stale ?? []) as { id: string; legacy?: unknown }[], keep);
      run.opportunitiesKept = (stale?.length ?? 0) - ids.length;
      for (let i = 0; i < ids.length; i += 200) {
        const { error: e } = await data("jobslake_opportunities").delete().in("id", ids.slice(i, i + 200));
        if (e) throw new Error(`couldn't remove stale listings: ${e.message}`);
        run.opportunitiesDeleted += Math.min(200, ids.length - i);
      }
      budget -= run.opportunitiesDeleted;
      // 2. Gateway: nothing older than the age limit, and each source to its newest N.
      const ageCut = new Date(now.getTime() - settings.gatewayMaxAgeDays * 86_400_000).toISOString();
      const { count: aged, error: ea } = await data("gateway_listings").delete({ count: "exact" }).lt("observed_at", ageCut);
      if (ea) throw new Error(`couldn't remove old gateway listings: ${ea.message}`);
      run.gatewayDeleted += aged ?? 0;
      budget -= aged ?? 0;
      const { data: srcs } = await data("gateway_listings").select("source_id").limit(100000);
      const per = new Map<string, number>();
      for (const r of srcs ?? []) per.set(r.source_id, (per.get(r.source_id) ?? 0) + 1);
      for (const [source, n] of per) {
        if (n <= settings.gatewayMaxPerSource || budget <= 0) continue;
        const over = Math.min(n - settings.gatewayMaxPerSource, budget);
        const { data: oldest } = await data("gateway_listings").select("id").eq("source_id", source).order("observed_at", { ascending: true }).limit(over);
        const del = (oldest ?? []).map((r) => r.id as string);
        for (let i = 0; i < del.length; i += 200) {
          const { error: e } = await data("gateway_listings").delete().in("id", del.slice(i, i + 200));
          if (e) throw new Error(`couldn't trim a gateway source: ${e.message}`);
        }
        run.gatewayDeleted += del.length;
        budget -= del.length;
      }
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e);
  }
  run.dbBytes = (await dbUsage().catch(() => null))?.dbBytes ?? null;
  const d = await readDoc();
  await stateStore.put(PLATFORM_TENANT, KEY, { ...d, lastRun: run });
  return run;
}
