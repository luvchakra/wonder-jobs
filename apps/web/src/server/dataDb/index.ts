/**
 * Each module's data database (owner, 2026-11-01; per module 2026-11-03: "each module linked to a separate Supabase
 * database … the data for that module should route to that particular database and not other databases"; "current
 * ddb should be dedicated for jobs … don't have any fallback").
 *
 * WorksLake's bulky, re-fetchable data (its listing pool, search cache, the gateway's listings and Jobs' H-1B
 * employers) lives, module by module, in that module's own Supabase project, so each grows on its own free plan and
 * none can fill the main database or slow sign-in, saves and applications. A module's data goes to its own database
 * and nowhere else; there is no shared data database. A module without one (not set up yet, or switched off) keeps its
 * data in the main database, as every module did before data databases existed. The app's own data (accounts, saves,
 * applications, settings, the gateway's config) always stays in the main database.
 *
 * Connections: Admin → Data databases (URL, service key encrypted with secrets.ts, on/off), one per module. The data
 * database set up on 2026-11-01 (`wj.datadb`, or WORKSLAKE_DATA_DB_URL + WORKSLAKE_DATA_DB_KEY) is Jobs'. Switching on
 * is the admin's step after Test and Copy, so a search never reads an empty database. Each database has its own
 * safeguards (dbGuard.ts), so a struggling one never slows another.
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

/** Every module's connection: `{ modules: { <module>: StoredDataDb } }`. */
const MODULES_DOC = "wj.datadbs" as const;
/** The data database set up before there was one per module (2026-11-01): Jobs' from now on. */
const LEGACY_DOC = "wj.datadb" as const;
/** The module the legacy data database (and its environment variables) belongs to. */
export const LEGACY_MODULE = "jobs";
/** Only a Supabase project URL: the server sends a service key there, so never an arbitrary host. */
export const PROJECT_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
/** A module's id ("jobs", "therapists" …); the admin route checks it against the registry. */
const MODULE_ID = /^[a-z]{2,20}$/;
/** The tables that carry a `module` column, so one module's rows can be told apart from another's. */
const PER_MODULE: readonly DataTable[] = ["jobslake_opportunities", "gateway_listings"];

/**
 * What a module's database holds, and what a copy moves: its listings in WorksLake's pool and the gateway's, and for
 * Jobs the H-1B employers. The search cache isn't copied (it rebuilds itself), but is kept in the module's database too.
 */
export function tablesFor(module: string): readonly DataTable[] {
  return module === "jobs" ? ["jobslake_opportunities", "gateway_listings", "jobslake_h1b_employers"] : PER_MODULE;
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
  from: "environment" | "platform";
}

interface Active {
  at: number;
  /** Modules whose own data database is on: their data is read and written there, and nowhere else. */
  modules: Record<string, Conn>;
  /** The setting couldn't be read yet: where the data lives isn't known, so nothing is written (dataWritable). */
  unknown?: boolean;
}
const g = globalThis as unknown as { __wjDataDb?: Active; __wjDataDbLoading?: Promise<void> | null; __wjDataConns?: Map<string, Conn> };
const TTL = 60_000;
/** After a failed first read, ask again this soon. */
const RETRY_MS = 5_000;

function client(url: string, key: string, fetcher?: typeof fetch): AdminClient {
  return createClient(url, key, { db: { schema: "public" }, auth: { persistSession: false, autoRefreshToken: false }, ...(fetcher ? { global: { fetch: fetcher } } : {}) });
}

/** One client (with its own guard) per project and key, kept across reloads of the setting. */
function conn(url: string, key: string, from: Conn["from"]): Conn {
  const conns = (g.__wjDataConns ??= new Map());
  const id = `${url}|${key.slice(-12)}`;
  let c = conns.get(id);
  if (!c) {
    const own = createDbGuard();
    c = { url, client: client(url, key, own.fetch), guard: own, from };
    conns.set(id, c);
  }
  return c;
}

function fromEnv(): { url: string; key: string } | null {
  const url = process.env.WORKSLAKE_DATA_DB_URL?.trim().replace(/\/$/, "");
  const key = process.env.WORKSLAKE_DATA_DB_KEY?.trim();
  return url && key && PROJECT_URL.test(url) ? { url, key } : null;
}

/** Every module's saved connection; the legacy data database counts as Jobs' until Jobs has one of its own. */
async function storedModules(): Promise<Record<string, StoredDataDb>> {
  const st = await state();
  const [doc, legacy] = await Promise.all([st.get(PLATFORM_TENANT, MODULES_DOC), st.get(PLATFORM_TENANT, LEGACY_DOC)]);
  const mods = { ...(((doc?.state as { modules?: Record<string, StoredDataDb> } | undefined)?.modules as Record<string, StoredDataDb> | undefined) ?? {}) };
  const old = legacy?.state as StoredDataDb | undefined;
  if (old?.url && !mods[LEGACY_MODULE]) mods[LEGACY_MODULE] = old;
  return mods;
}

/** Reads which database holds each module's data (at most once a minute; concurrent callers share one read). */
export function loadDataDb(force = false): Promise<void> {
  const now = Date.now();
  if (!force && g.__wjDataDb && now - g.__wjDataDb.at < TTL) return Promise.resolve();
  if (g.__wjDataDbLoading && !force) return g.__wjDataDbLoading;
  const p = (async () => {
    try {
      const mods = await storedModules();
      const modules: Record<string, Conn> = {};
      for (const [m, d] of Object.entries(mods)) if (MODULE_ID.test(m) && d?.enabled && PROJECT_URL.test(d.url)) modules[m] = conn(d.url, (await crypto()).decrypt(d.keyCipher), "platform");
      // WORKSLAKE_DATA_DB_URL/KEY in the deployment: Jobs' data database, ahead of any saved setting.
      const env = fromEnv();
      if (env) modules[LEGACY_MODULE] = conn(env.url, env.key, "environment");
      g.__wjDataDb = { at: now, modules };
    } catch {
      // Keep what was there. With nothing known yet, don't assume the main database (a cold instance whose read failed
      // once wrote 2,000 listings there while the data database was on, 2026-11-02): stay unknown and ask again soon.
      g.__wjDataDb = g.__wjDataDb && !g.__wjDataDb.unknown ? { ...g.__wjDataDb, at: now } : { at: now - TTL + RETRY_MS, modules: {}, unknown: true };
    }
  })().finally(() => {
    g.__wjDataDbLoading = null;
  });
  g.__wjDataDbLoading = p;
  return p;
}

type Query = NonNullable<ReturnType<typeof mainFrom>>;

/** The main database's copy of a data table (where a module without its own data database keeps its data). */
function mainFrom(table: DataTable) {
  const main = getSupabaseAdmin();
  return main ? main.schema("wonderjobs").from(table) : null;
}

/**
 * A query on one of WorksLake's data tables for one module: in its own data database when that is on, else the main
 * database. Never another module's database. Callers `await loadDataDb()` first (entry points do). Null when no
 * database is configured (tests). Tables without a module (the search cache, H-1B employers) default to Jobs.
 */
export function dataFrom(table: DataTable, module = "jobs") {
  const own = g.__wjDataDb?.modules[module];
  return own ? own.client.from(table) : mainFrom(table);
}

/** Where a module's data lives now: its own database, or the main one. */
export function dataHome(module: string): "own" | "main" {
  return g.__wjDataDb?.modules[module] ? "own" : "main";
}

/**
 * The same table in every database that holds data now (the main one, and each module's own), once each: for work
 * that isn't about one module (a source's clean-up, the daily safeguards, cache pruning, a listing looked up by id).
 */
export function dataEvery(table: DataTable): { modules: string[] | "main"; from: () => Query }[] {
  const out: { modules: string[] | "main"; from: () => Query }[] = [];
  if (getSupabaseAdmin()) out.push({ modules: "main", from: () => mainFrom(table)! });
  const byUrl = new Map<string, { modules: string[]; from: () => Query }>();
  for (const [m, c] of Object.entries(g.__wjDataDb?.modules ?? {})) {
    const e = byUrl.get(c.url);
    if (e) e.modules.push(m);
    else byUrl.set(c.url, { modules: [m], from: () => c.client.from(table) as unknown as Query });
  }
  return [...out, ...byUrl.values()];
}

/** Each module's own data database that is on, with its safeguards (Admin → Databases). */
export async function moduleDataDbs(): Promise<{ module: string; url: string; client: AdminClient; guard: ReturnType<Conn["guard"]["state"]> }[]> {
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

/** A module's data database's size (`db_usage`), when it is on; null otherwise or when it doesn't answer. */
async function usageOf(c: AdminClient): Promise<number | null> {
  const r = await Promise.race([c.rpc("db_usage"), new Promise<null>((res) => setTimeout(() => res(null), 4000))]);
  if (!r || r.error || !r.data) return null;
  return Number((r.data as { db_bytes: number }).db_bytes);
}

/* ------------------------------------------------------------------ admin */

/** One module's row on Admin → Data databases. */
export interface ModuleDataDb {
  module: string;
  /** Where its data is read and written now. */
  home: "own" | "main";
  from: "environment" | "platform" | null;
  saved: { url: string; masked: string; enabled: boolean; savedAt: string; lastTest?: StoredDataDb["lastTest"]; lastCopy?: StoredDataDb["lastCopy"] } | null;
  /** Its own database's size, when on. */
  sizeBytes: number | null;
  /** Other modules' rows still in this module's database (the legacy one held every module's): moved out with "evict". */
  foreignRows: number | null;
  tables: readonly string[];
}

const toSaved = (s: StoredDataDb | undefined): ModuleDataDb["saved"] => (s ? { url: s.url, masked: s.masked, enabled: s.enabled, savedAt: s.savedAt, lastTest: s.lastTest, lastCopy: s.lastCopy } : null);

/** Rows of other modules in a module's own database (only the legacy one should have any). */
async function foreignRows(module: string): Promise<number | null> {
  const c = g.__wjDataDb?.modules[module];
  if (!c) return null;
  let n = 0;
  for (const t of PER_MODULE) {
    const { count, error } = await c.client.from(t).select(KEY[t], { count: "exact", head: true }).neq("module", module);
    if (error) return null;
    n += count ?? 0;
  }
  return n;
}

/** Every module's data database at a glance (Admin → Data databases): where its data is, its connection and size. */
export async function dataDbOverview(modules: readonly string[]): Promise<ModuleDataDb[]> {
  await loadDataDb(true);
  const mods = await storedModules();
  return Promise.all(
    modules.map(async (m) => {
      const c = g.__wjDataDb?.modules[m];
      const [sizeBytes, foreign] = c ? await Promise.all([usageOf(c.client).catch(() => null), m === LEGACY_MODULE ? foreignRows(m).catch(() => null) : Promise.resolve(0)]) : [null, null];
      return { module: m, home: dataHome(m), from: c?.from ?? null, saved: toSaved(mods[m]), sizeBytes, foreignRows: foreign, tables: tablesFor(m) };
    }),
  );
}

async function stored(module: string): Promise<StoredDataDb | undefined> {
  return (await storedModules())[module];
}

/** Saves a module's connection (or removes it), folding the legacy document into Jobs' entry on the first write. */
async function store(module: string, doc: StoredDataDb | null): Promise<void> {
  const st = await state();
  const mods = await storedModules();
  if (doc) mods[module] = doc;
  else delete mods[module];
  await st.put(PLATFORM_TENANT, MODULES_DOC, { modules: mods });
  if (module === LEGACY_MODULE && (await st.get(PLATFORM_TENANT, LEGACY_DOC))) await st.remove(PLATFORM_TENANT, LEGACY_DOC);
}

const validModule = (m: string) => MODULE_ID.test(m);
const mask = (key: string) => `${key.slice(0, 6)}••••${key.slice(-4)}`;

/**
 * Saves a module's connection, switched off. A new key replaces the old; leaving the key blank keeps it (same URL
 * only). A project another module already uses is refused: each module's data is its own.
 */
export async function saveDataDb(module: string, input: { url: string; key?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!validModule(module)) return { ok: false, message: "Unknown module." };
  const url = input.url.trim().replace(/\/$/, "");
  if (!PROJECT_URL.test(url)) return { ok: false, message: "Use the project URL from Supabase → Project Settings → API (https://<project>.supabase.co)." };
  const mods = await storedModules();
  const taken = Object.entries(mods).find(([m, d]) => m !== module && d.url === url);
  if (taken) return { ok: false, message: `That project already holds the ${taken[0]} module's data. Give each module its own project.` };
  const prev = mods[module];
  const key = input.key?.trim();
  if (!key && (!prev || prev.url !== url)) return { ok: false, message: "Paste the project's service role (secret) key." };
  if (key && key.length < 40) return { ok: false, message: "That doesn't look like a service role key." };
  const doc: StoredDataDb = key ? { url, keyCipher: (await crypto()).encrypt(key), masked: mask(key), enabled: false, savedAt: new Date().toISOString() } : { ...prev!, enabled: false, savedAt: new Date().toISOString() };
  await store(module, doc);
  await loadDataDb(true);
  return { ok: true };
}

/** Connects to a module's saved data database and checks every table exists (the setup script ran). Records the result. */
export async function testDataDb(module: string): Promise<StoredDataDb["lastTest"]> {
  const s = await stored(module);
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
  await store(module, { ...s, lastTest });
  return lastTest;
}

const PAGE = 500;

/**
 * Where a module's rows may be while its own database is off: the main database and, for any module but Jobs, Jobs'
 * database (the legacy data database held every module's data). A copy reads from each in turn; "free the old copy"
 * clears each.
 */
function oldHomes(module: string, table: DataTable): (() => Query)[] {
  const homes: (() => Query)[] = [];
  if (getSupabaseAdmin()) homes.push(() => mainFrom(table)!);
  const legacy = g.__wjDataDb?.modules[LEGACY_MODULE];
  if (module !== LEGACY_MODULE && legacy && PER_MODULE.includes(table)) homes.push(() => legacy.client.from(table) as unknown as Query);
  return homes;
}

/**
 * Copies one page of one table, only this module's rows, into its data database (upsert, so running it again is
 * safe). `part` is which old home it reads from (oldHomes); the admin page calls it until `done`.
 */
export async function copyPage(module: string, table: DataTable, part: number, offset: number): Promise<{ copied: number; part: number; offset: number; done: boolean } | { error: string }> {
  if (!tablesFor(module).includes(table)) return { error: "Unknown table." };
  await loadDataDb();
  const s = await stored(module);
  if (!s) return { error: "Save the connection first." };
  if (!s.lastTest?.ok) return { error: "Test the connection first." };
  const homes = oldHomes(module, table);
  if (part >= homes.length) return { copied: 0, part, offset: 0, done: true };
  let q = homes[part]().select("*");
  if (PER_MODULE.includes(table)) q = q.eq("module", module);
  const { data, error } = await q.order(KEY[table], { ascending: true }).range(offset, offset + PAGE - 1);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = data ?? [];
  if (rows.length) {
    const { error: e } = await client(s.url, (await crypto()).decrypt(s.keyCipher)).from(table).upsert(rows, { onConflict: KEY[table] });
    if (e) return { error: `Couldn't write ${table}: ${e.message}` };
  }
  const partDone = rows.length < PAGE;
  const done = partDone && part + 1 >= homes.length;
  if (done) {
    const now = (await stored(module)) ?? s;
    await store(module, { ...now, lastCopy: { at: new Date().toISOString(), rows: { ...(now.lastCopy?.rows ?? {}), [table]: (part === 0 ? 0 : (now.lastCopy?.rows?.[table] ?? 0)) + offset + rows.length } } });
  }
  return { copied: rows.length, part: partDone ? part + 1 : part, offset: partDone ? 0 : offset + rows.length, done };
}

/** Switches a module's data to its own database (needs a passing test) or back to the main one. */
export async function setDataDbEnabled(module: string, enabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await stored(module);
  if (!s) return { ok: false, message: "Save the connection first." };
  if (enabled && !s.lastTest?.ok) return { ok: false, message: "Test the connection first." };
  await store(module, { ...s, enabled });
  await loadDataDb(true);
  return { ok: true };
}

/** Forgets a module's connection; its data goes back to the main database. */
export async function removeDataDb(module: string): Promise<void> {
  await store(module, null);
  await loadDataDb(true);
}

/** Tests only. */
export function __resetDataDb() {
  g.__wjDataDb = undefined;
  g.__wjDataDbLoading = null;
}

/**
 * After switching a module on, deletes one batch of its old copy (its rows in the main database and, for any module
 * but Jobs, in Jobs' database), freeing that space. Only while its own database is on, so nothing in use is deleted.
 */
export async function clearMainPage(module: string, table: DataTable): Promise<{ deleted: number; done: boolean } | { error: string }> {
  if (!tablesFor(module).includes(table)) return { error: "Unknown table." };
  await loadDataDb(true);
  if (!g.__wjDataDb?.modules[module]) return { error: "Switch on its own database first." };
  let deleted = 0;
  for (const from of oldHomes(module, table)) {
    let q = from().select(KEY[table]);
    if (PER_MODULE.includes(table)) q = q.eq("module", module);
    const { data, error } = await q.limit(1000);
    if (error) return { error: error.message };
    const ids = (data ?? []).map((r) => (r as unknown as Record<string, string>)[KEY[table]]);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e } = await from().delete().in(KEY[table], ids.slice(i, i + 200));
      if (e) return { error: e.message };
    }
    deleted += ids.length;
    if (ids.length >= 1000) return { deleted, done: false };
  }
  return { deleted, done: true };
}

/**
 * Moves one batch of other modules' rows out of a module's own database (the legacy data database held every
 * module's): each row is written where its module keeps its data now (its own database, or the main one), then
 * deleted here. Run until `done`; safe to run again.
 */
export async function evictPage(module: string, table: DataTable): Promise<{ moved: number; done: boolean } | { error: string }> {
  if (!PER_MODULE.includes(table)) return { moved: 0, done: true };
  await loadDataDb(true);
  const here = g.__wjDataDb?.modules[module];
  if (!here) return { error: "Switch on its own database first." };
  const { data, error } = await here.client.from(table).select("*").neq("module", module).order(KEY[table], { ascending: true }).limit(PAGE);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = (data ?? []) as Record<string, unknown>[];
  const byModule = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) byModule.set(String(r.module), [...(byModule.get(String(r.module)) ?? []), r]);
  for (const [m, list] of byModule) {
    const to = dataFrom(table, m);
    if (!to) return { error: "No main database." };
    // Never back into this same database (a module whose own database is this one).
    if (g.__wjDataDb?.modules[m]?.url !== here.url) {
      const { error: e } = await to.upsert(list, { onConflict: KEY[table] });
      if (e) return { error: `Couldn't move ${m}'s ${table}: ${e.message}` };
    }
    const ids = list.map((r) => String(r[KEY[table]]));
    for (let i = 0; i < ids.length; i += 200) {
      const { error: d } = await here.client.from(table).delete().in(KEY[table], ids.slice(i, i + 200));
      if (d) return { error: d.message };
    }
  }
  return { moved: rows.length, done: rows.length < PAGE };
}
