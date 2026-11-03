/**
 * The optional WorksLake data database (owner, 2026-11-01: "use a separate database to store the WWDG data … in the
 * platform admin of WonderWorks keep option to enter details of separate optional db for WorksLake Data").
 *
 * WorksLake's bulky, re-fetchable data (its listing pool, search cache, H-1B employers and the gateway's listings) can
 * live in a second Supabase project, so it can't fill the main database or slow sign-in, saves and applications. The
 * app's own data (accounts, saves, applications, settings, the gateway's config) always stays in the main database.
 *
 * - Off (the default, or no second project): every data table is read from the main database, as before.
 * - On: those four tables are read and written in the data database's `public` schema (dataDb/schema.ts).
 * Its connection comes from WORKSLAKE_DATA_DB_URL + WORKSLAKE_DATA_DB_KEY, or from Admin → Settings → Data database
 * (URL, service key encrypted with secrets.ts, on/off). Switching on is the admin's step after Test and Copy, so a
 * search never reads an empty database. Every request goes through the same safeguards as the main one (dbGuard.ts).
 */
import { createClient } from "@supabase/supabase-js";
import { createDbGuard } from "../dbGuard";
import { getSupabaseAdmin, type AdminClient } from "../supabase";
// The platform-wide documents' tenant (billing/plansConfig.ts PLATFORM_TENANT), not imported: that module loads the state store.
const PLATFORM_TENANT = "__platform__";

// Loaded on first use: both create clients when imported, and the data tables' callers import this module early.
const state = async () => (await import("../state")).stateStore;
const crypto = () => import("../secrets");

export const DATA_TABLES = ["jobslake_opportunities", "jobslake_search_cache", "jobslake_h1b_employers", "gateway_listings"] as const;
export type DataTable = (typeof DATA_TABLES)[number];
/** Each table's primary key, for copying (upsert) and paging. */
const KEY: Record<DataTable, string> = { jobslake_opportunities: "id", jobslake_search_cache: "key", jobslake_h1b_employers: "name_key", gateway_listings: "id" };

const DOC = "wj.datadb" as const;
/** Each module's own data database (owner, 2026-11-03: "each module linked to a separate Supabase database"). */
const MODULES_DOC = "wj.datadbs" as const;
/** Only a Supabase project URL: the server sends a service key there, so never an arbitrary host. */
export const PROJECT_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
/** A module's id ("jobs", "therapists" …); the admin route checks it against the registry. */
const MODULE_ID = /^[a-z]{2,20}$/;

/**
 * Which data database a setting is about: "shared" (the one WorksLake data database, for every module without its own)
 * or a module's id (that module's own).
 */
export type DataTarget = "shared" | string;
/** The tables that carry a `module` column, so one module's rows can be told apart from another's. */
const PER_MODULE: readonly DataTable[] = ["jobslake_opportunities", "gateway_listings"];

/**
 * What one module's own database holds: its listings in WorksLake's pool and the gateway's, its search cache, and for
 * Jobs the H-1B employers. What a copy moves: the cache isn't copied (it rebuilds itself).
 */
export function tablesFor(target: DataTarget): readonly DataTable[] {
  if (target === "shared") return DATA_TABLES;
  return target === "jobs" ? ["jobslake_opportunities", "gateway_listings", "jobslake_h1b_employers"] : PER_MODULE;
}

export interface StoredDataDb {
  url: string;
  /** The service key, encrypted (secrets.ts). Never sent to a browser. */
  keyCipher: string;
  masked: string;
  enabled: boolean;
  savedAt: string;
  lastTest?: { at: string; ok: boolean; message: string; tables?: Record<string, number> };
  lastCopy?: { at: string; rows: Record<string, number> };
}

interface Conn {
  url: string;
  client: AdminClient;
  guard: ReturnType<typeof createDbGuard>;
}

interface Active {
  at: number;
  /** The shared data database when it is on; null when its tables stay in the main database. */
  client: AdminClient | null;
  from: "environment" | "platform" | null;
  /** Modules whose own data database is on: their data is read and written there, and nowhere else. */
  modules: Record<string, Conn>;
  /** The setting couldn't be read yet: where the data lives isn't known, so nothing is written (dataWritable). */
  unknown?: boolean;
}
const g = globalThis as unknown as { __wjDataDb?: Active; __wjDataDbLoading?: Promise<void> | null; __wjDataConns?: Map<string, Conn> };
const TTL = 60_000;
/** After a failed first read, ask again this soon. */
const RETRY_MS = 5_000;
// Each database has its own guard: a struggling one backs off without blocking the main one's (or another module's) requests.
const guard = createDbGuard();

function client(url: string, key: string, fetcher: typeof fetch = guard.fetch): AdminClient {
  return createClient(url, key, { db: { schema: "public" }, auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
}

/** One client per project URL and key, kept across reloads of the setting. */
function conn(url: string, key: string): Conn {
  const conns = (g.__wjDataConns ??= new Map());
  const id = `${url}|${key.slice(-12)}`;
  let c = conns.get(id);
  if (!c) {
    const own = createDbGuard();
    c = { url, client: client(url, key, own.fetch), guard: own };
    conns.set(id, c);
  }
  return c;
}

function fromEnv(): { url: string; key: string } | null {
  const url = process.env.WORKSLAKE_DATA_DB_URL?.trim().replace(/\/$/, "");
  const key = process.env.WORKSLAKE_DATA_DB_KEY?.trim();
  return url && key && PROJECT_URL.test(url) ? { url, key } : null;
}

async function storedModules(): Promise<Record<string, StoredDataDb>> {
  const doc = (await (await state()).get(PLATFORM_TENANT, MODULES_DOC))?.state as { modules?: Record<string, StoredDataDb> } | undefined;
  return doc?.modules && typeof doc.modules === "object" ? doc.modules : {};
}

/** Reads which database holds each module's data (at most once a minute; concurrent callers share one read). */
export function loadDataDb(force = false): Promise<void> {
  const now = Date.now();
  if (!force && g.__wjDataDb && now - g.__wjDataDb.at < TTL) return Promise.resolve();
  if (g.__wjDataDbLoading && !force) return g.__wjDataDbLoading;
  const p = (async () => {
    try {
      const env = fromEnv();
      const [doc, mods] = await Promise.all([env ? Promise.resolve(undefined) : (async () => (await (await state()).get(PLATFORM_TENANT, DOC))?.state as StoredDataDb | undefined)(), storedModules()]);
      const modules: Record<string, Conn> = {};
      for (const [m, d] of Object.entries(mods)) if (MODULE_ID.test(m) && d?.enabled && PROJECT_URL.test(d.url)) modules[m] = conn(d.url, (await crypto()).decrypt(d.keyCipher));
      if (env) {
        g.__wjDataDb = { at: now, client: g.__wjDataDb?.from === "environment" && g.__wjDataDb.client ? g.__wjDataDb.client : client(env.url, env.key), from: "environment", modules };
        return;
      }
      g.__wjDataDb = doc?.enabled && PROJECT_URL.test(doc.url) ? { at: now, client: client(doc.url, (await crypto()).decrypt(doc.keyCipher)), from: "platform", modules } : { at: now, client: null, from: null, modules };
    } catch {
      // Keep what was there. With nothing known yet, don't assume the main database (a cold instance whose read failed
      // once wrote 2,000 listings there while the data database was on, 2026-11-02): stay unknown and ask again soon.
      g.__wjDataDb = g.__wjDataDb && !g.__wjDataDb.unknown ? { ...g.__wjDataDb, at: now } : { at: now - TTL + RETRY_MS, client: null, from: null, modules: {}, unknown: true };
    }
  })().finally(() => {
    g.__wjDataDbLoading = null;
  });
  g.__wjDataDbLoading = p;
  return p;
}

/** The main database's copy of a data table (where everything lives with no data database on). */
function mainFrom(table: DataTable) {
  const main = getSupabaseAdmin();
  return main ? main.schema("wonderjobs").from(table) : null;
}

/**
 * A query on one of WorksLake's data tables for one module, in whichever database holds that module's data now: its own
 * data database when it has one switched on, else the shared data database, else the main one. Callers
 * `await loadDataDb()` first (entry points do). Null when no database is configured (tests).
 * Tables without a module (the search cache, H-1B employers) default to Jobs, whose data they are unless a module says.
 */
export function dataFrom(table: DataTable, module = "jobs") {
  const own = g.__wjDataDb?.modules[module];
  if (own) return own.client.from(table);
  const data = g.__wjDataDb?.client;
  if (data) return data.from(table);
  return mainFrom(table);
}

/** Where a module's data lives now. */
export function dataHome(module: string): "own" | "shared" | "main" {
  return g.__wjDataDb?.modules[module] ? "own" : g.__wjDataDb?.client ? "shared" : "main";
}

/**
 * The same table in every database that may hold some of it now (the main or shared one, and each module's own), once
 * each: for work that isn't about one module (a source's clean-up, the daily safeguards, a lookup by id).
 * `modules` lists, for each, the modules whose data it holds ("*": every module without its own).
 */
export function dataEvery(table: DataTable): { modules: string[] | "*"; from: () => NonNullable<ReturnType<typeof mainFrom>> }[] {
  const out: { modules: string[] | "*"; from: () => NonNullable<ReturnType<typeof mainFrom>> }[] = [];
  const shared = g.__wjDataDb?.client;
  if (shared) out.push({ modules: "*", from: () => shared.from(table) });
  else if (getSupabaseAdmin()) out.push({ modules: "*", from: () => mainFrom(table)! });
  const byUrl = new Map<string, { modules: string[]; from: () => NonNullable<ReturnType<typeof mainFrom>> }>();
  for (const [m, c] of Object.entries(g.__wjDataDb?.modules ?? {})) {
    const e = byUrl.get(c.url);
    if (e) e.modules.push(m);
    else byUrl.set(c.url, { modules: [m], from: () => c.client.from(table) });
  }
  return [...out, ...byUrl.values()];
}

/** The shared data database's client and what its safeguards are doing, when it is on (Admin → Databases). */
export async function dataDbNow(): Promise<{ client: AdminClient; guard: ReturnType<typeof guard.state> } | null> {
  await loadDataDb();
  const c = g.__wjDataDb?.client;
  return c ? { client: c, guard: guard.state() } : null;
}

/** Each module's own data database that is on, with its safeguards (Admin → Databases). */
export async function moduleDataDbs(): Promise<{ module: string; url: string; client: AdminClient; guard: ReturnType<typeof guard.state> }[]> {
  await loadDataDb();
  return Object.entries(g.__wjDataDb?.modules ?? {}).map(([module, c]) => ({ module, url: c.url, client: c.client, guard: c.guard.state() }));
}

/**
 * Whether WorksLake may write its data now: false while it isn't known which database holds it (the setting couldn't
 * be read), so a write never lands in the wrong one. The data is re-fetchable; a skipped write costs nothing lasting.
 */
export function dataWritable(): boolean {
  return !g.__wjDataDb?.unknown;
}

/** A data database's own `db_usage` (its size), when it is on: the shared one, or a module's own. */
export async function dataDbUsage(target: DataTarget = "shared"): Promise<{ dbBytes: number } | null> {
  await loadDataDb();
  const data = target === "shared" ? g.__wjDataDb?.client : g.__wjDataDb?.modules[target]?.client;
  if (!data) return null;
  const { data: d, error } = await data.rpc("db_usage");
  return error || !d ? null : { dbBytes: Number((d as { db_bytes: number }).db_bytes) };
}

/* ------------------------------------------------------------------ admin */

export interface DataDbStatus {
  target: DataTarget;
  /** Where this target's data is read and written now: for a module, its own database, the shared one or the main one. */
  active: "main" | "data" | "shared";
  from: "environment" | "platform" | null;
  saved: { url: string; masked: string; enabled: boolean; savedAt: string; lastTest?: StoredDataDb["lastTest"]; lastCopy?: StoredDataDb["lastCopy"] } | null;
  tables: readonly string[];
}

async function stored(target: DataTarget = "shared"): Promise<StoredDataDb | undefined> {
  if (target === "shared") return (await (await state()).get(PLATFORM_TENANT, DOC))?.state as StoredDataDb | undefined;
  return (await storedModules())[target];
}

async function store(target: DataTarget, doc: StoredDataDb | null): Promise<void> {
  const st = await state();
  if (target === "shared") {
    if (doc) await st.put(PLATFORM_TENANT, DOC, doc);
    else await st.remove(PLATFORM_TENANT, DOC);
    return;
  }
  const mods = await storedModules();
  if (doc) mods[target] = doc;
  else delete mods[target];
  await st.put(PLATFORM_TENANT, MODULES_DOC, { modules: mods });
}

const validTarget = (t: DataTarget) => t === "shared" || MODULE_ID.test(t);

const toSaved = (s: StoredDataDb | undefined): DataDbStatus["saved"] => (s ? { url: s.url, masked: s.masked, enabled: s.enabled, savedAt: s.savedAt, lastTest: s.lastTest, lastCopy: s.lastCopy } : null);

export async function dataDbStatus(target: DataTarget = "shared"): Promise<DataDbStatus> {
  await loadDataDb(true);
  const s = await stored(target);
  if (target === "shared") return { target, active: g.__wjDataDb?.client ? "data" : "main", from: g.__wjDataDb?.from ?? null, saved: toSaved(s), tables: DATA_TABLES };
  const home = dataHome(target);
  return { target, active: home === "own" ? "data" : home, from: home === "own" ? "platform" : null, saved: toSaved(s), tables: tablesFor(target) };
}

/** Every module's data home and its own saved connection (Admin → Data database's overview). */
export async function dataDbOverview(modules: readonly string[]): Promise<{ module: string; home: "own" | "shared" | "main"; saved: DataDbStatus["saved"] }[]> {
  await loadDataDb(true);
  const mods = await storedModules();
  return modules.map((m) => ({ module: m, home: dataHome(m), saved: toSaved(mods[m]) }));
}

const mask = (key: string) => `${key.slice(0, 6)}••••${key.slice(-4)}`;

/**
 * Saves the connection, switched off. A new key replaces the old; leaving the key blank keeps it (same URL only). A
 * module's own project can't be one another module (or the shared database) already uses: each module's data is its own.
 */
export async function saveDataDb(input: { url: string; key?: string }, target: DataTarget = "shared"): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!validTarget(target)) return { ok: false, message: "Unknown module." };
  const url = input.url.trim().replace(/\/$/, "");
  if (!PROJECT_URL.test(url)) return { ok: false, message: "Use the project URL from Supabase → Project Settings → API (https://<project>.supabase.co)." };
  const others = [...Object.entries(await storedModules()).filter(([m]) => m !== target).map(([m, d]) => [m, d.url] as const), ...(target === "shared" ? [] : [["shared", (await stored("shared"))?.url ?? ""] as const])];
  const taken = others.find(([, u]) => u === url);
  if (taken) return { ok: false, message: taken[0] === "shared" ? "That project is the shared data database. Give each module its own project." : `That project already holds the ${taken[0]} module's data. Give each module its own project.` };
  const prev = await stored(target);
  const key = input.key?.trim();
  if (!key && (!prev || prev.url !== url)) return { ok: false, message: "Paste the project's service role (secret) key." };
  if (key && key.length < 40) return { ok: false, message: "That doesn't look like a service role key." };
  const doc: StoredDataDb = key ? { url, keyCipher: (await crypto()).encrypt(key), masked: mask(key), enabled: false, savedAt: new Date().toISOString() } : { ...prev!, enabled: false, savedAt: new Date().toISOString() };
  await store(target, doc);
  await loadDataDb(true);
  return { ok: true };
}

/** Connects to the saved data database and checks every table exists (the setup script ran). Records the result. */
export async function testDataDb(target: DataTarget = "shared"): Promise<StoredDataDb["lastTest"]> {
  const s = await stored(target);
  if (!s) return { at: new Date().toISOString(), ok: false, message: "Save the connection first." };
  const c = client(s.url, (await crypto()).decrypt(s.keyCipher));
  const tables: Record<string, number> = {};
  let message = "Connected; every table is there.";
  let ok = true;
  for (const t of DATA_TABLES) {
    const { count, error } = await c.from(t).select(KEY[t], { count: "exact", head: true });
    if (error) {
      ok = false;
      message = /PGRST205|does not exist|schema cache/i.test(`${error.code} ${error.message}`) ? `Table ${t} is missing: run the setup script in the new project's SQL editor.` : /JWT|401|invalid/i.test(error.message) ? "The key was refused: use the service role (secret) key." : `Couldn't read ${t}: ${error.message}`;
      break;
    }
    tables[t] = count ?? 0;
  }
  // The script's functions (size and performance, for Admin → Databases): an older script lacks db_health().
  if (ok) {
    const { error: fe } = await c.rpc("db_health");
    if (fe) message = "Connected; every table is there. The setup script is out of date (no performance figures): run it again, it's safe to re-run.";
  }
  const lastTest = { at: new Date().toISOString(), ok, message, tables };
  await store(target, { ...s, lastTest });
  return lastTest;
}

const PAGE = 500;

/**
 * Where a target's data lives while its own database is off, so a copy reads from there and "free the old copy" clears
 * it: the main database for the shared one; for a module, the shared data database when that is on, else the main one.
 */
function previousHome(target: DataTarget, table: DataTable) {
  if (target !== "shared" && g.__wjDataDb?.client) return g.__wjDataDb.client.from(table);
  return mainFrom(table);
}

/**
 * Copies one page of one table into the target's data database (upsert, so running it again is safe): everything for
 * the shared one, only that module's rows for a module's own. The admin page calls it page after page until `done`.
 */
export async function copyPage(table: DataTable, offset: number, target: DataTarget = "shared"): Promise<{ copied: number; done: boolean } | { error: string }> {
  if (!tablesFor(target).includes(table)) return { error: "Unknown table." };
  await loadDataDb();
  const s = await stored(target);
  if (!s || !getSupabaseAdmin()) return { error: "Save the connection first." };
  if (!s.lastTest?.ok) return { error: "Test the connection first." };
  let q = previousHome(target, table)!.select("*");
  if (target !== "shared" && PER_MODULE.includes(table)) q = q.eq("module", target);
  const { data, error } = await q.order(KEY[table], { ascending: true }).range(offset, offset + PAGE - 1);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = data ?? [];
  if (rows.length) {
    const { error: e } = await client(s.url, (await crypto()).decrypt(s.keyCipher)).from(table).upsert(rows, { onConflict: KEY[table] });
    if (e) return { error: `Couldn't write ${table}: ${e.message}` };
  }
  const done = rows.length < PAGE;
  if (done) {
    const now = (await stored(target)) ?? s;
    await store(target, { ...now, lastCopy: { at: new Date().toISOString(), rows: { ...(now.lastCopy?.rows ?? {}), [table]: offset + rows.length } } });
  }
  return { copied: rows.length, done };
}

/** Switches the target's data to its data database (needs a passing test) or back. */
export async function setDataDbEnabled(enabled: boolean, target: DataTarget = "shared"): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await stored(target);
  if (!s) return { ok: false, message: "Save the connection first." };
  if (enabled && !s.lastTest?.ok) return { ok: false, message: "Test the connection first." };
  await store(target, { ...s, enabled });
  await loadDataDb(true);
  return { ok: true };
}

/** Forgets the saved connection; the target's data goes back to where it lived before. */
export async function removeDataDb(target: DataTarget = "shared"): Promise<void> {
  await store(target, null);
  await loadDataDb(true);
}

/** Tests only. */
export function __resetDataDb() {
  g.__wjDataDb = undefined;
  g.__wjDataDbLoading = null;
}

/**
 * After switching on, deletes one batch of the old copy (for the shared database, the main database's; for a module's
 * own, that module's rows where they lived before), freeing its space. Only while the target's database is on, so
 * nothing in use is ever deleted.
 */
export async function clearMainPage(table: DataTable, target: DataTarget = "shared"): Promise<{ deleted: number; done: boolean } | { error: string }> {
  if (!tablesFor(target).includes(table)) return { error: "Unknown table." };
  await loadDataDb(true);
  if (target === "shared" ? !g.__wjDataDb?.client : !g.__wjDataDb?.modules[target]) return { error: "Switch to the data database first." };
  const from = () => (target === "shared" ? mainFrom(table) : previousHome(target, table));
  if (!from()) return { error: "No main database." };
  const filtered = target !== "shared" && PER_MODULE.includes(table);
  let q = from()!.select(KEY[table]);
  if (filtered) q = q.eq("module", target);
  const { data, error } = await q.limit(1000);
  if (error) return { error: error.message };
  const ids = (data ?? []).map((r) => (r as unknown as Record<string, string>)[KEY[table]]);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: e } = await from()!.delete().in(KEY[table], ids.slice(i, i + 200));
    if (e) return { error: e.message };
  }
  return { deleted: ids.length, done: ids.length < 1000 };
}
