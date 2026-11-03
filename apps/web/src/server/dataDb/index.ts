/**
 * Each module's data database (owner, 2026-11-01; per module 2026-11-03: "each module linked to a separate Supabase
 * database … the data for that module should route to that particular database and not other databases"; "current
 * ddb should be dedicated for jobs … don't have any fallback").
 *
 * WorksLake's bulky, re-fetchable data (its listing pool, search cache, the gateway's listings and Jobs' H-1B
 * employers) lives, module by module, in the module's DDB (a Supabase project), so it can't fill the main database or
 * slow sign-in, saves and applications. A module's data goes to its DDB and nowhere else. Modules may share one DDB
 * when the admin enters the same project for them (owner, 2026-11-03: "allow modules to share DDB if it is configured
 * like that"); every row carries its module, so each module's data stays apart. When a shared DDB fills up, a module is
 * moved to a new one: its new connection waits as `next` while the current one stays live, is tested and filled, then
 * switched to; the module's rows are then removed from every other database. A module without a DDB (not set up yet,
 * or switched off) keeps its data in the main database; there is no fallback DDB. The app's own data (accounts, saves,
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

/** One connection: a project URL and its service key. */
export interface DbConn {
  url: string;
  /** The service key, encrypted (secrets.ts). Never sent to a browser. */
  keyCipher: string;
  masked: string;
  savedAt: string;
  lastTest?: { at: string; ok: boolean; message: string; tables?: Record<string, number> };
  lastCopy?: { at: string; rows: Record<string, number> };
}

export interface StoredDataDb extends DbConn {
  enabled: boolean;
  /** A new DDB the module is moving to; the current one stays live until it's switched to. */
  next?: DbConn;
  /** Where the module's rows were before the last switch ("main", or the old DDB): cleared by "free the old copy". */
  previous?: { url: string; keyCipher: string };
}

interface Conn {
  url: string;
  client: AdminClient;
  guard: ReturnType<typeof createDbGuard>;
  from: "environment" | "platform";
  /** Connected with a legacy JWT key (service_role), which Supabase retires at the end of 2026. */
  legacy: boolean;
}

/**
 * A legacy JWT-based key (Supabase's `anon` / `service_role`, "eyJ…"), retired at the end of 2026 (Supabase: "Migrating
 * to publishable and secret API keys"); the new secret keys start "sb_secret_". Works on the key or its masked form.
 */
export const isLegacyKey = (key: string | null | undefined): boolean => !!key && key.trim().startsWith("eyJ");

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
    c = { url, client: client(url, key, own.fetch), guard: own, from, legacy: isLegacyKey(key) };
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

/**
 * How fresh the setting must be before a write (2026-11-03: "ensure that import job updates new data in correct module
 * specific ddb"): reads use the minute-long cache, but a write re-reads a setting older than this, so after an admin
 * switches a module to another DDB, other servers stop writing its rows to the old one within seconds, not a minute.
 */
export const WRITE_FRESH_MS = 10_000;

/** Reads which database holds each module's data (at most once a minute; concurrent callers share one read). */
export function loadDataDb(force = false, maxAgeMs = TTL): Promise<void> {
  const now = Date.now();
  if (!force && g.__wjDataDb && now - g.__wjDataDb.at < maxAgeMs) return Promise.resolve();
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
export async function moduleDataDbs(): Promise<{ module: string; url: string; client: AdminClient; guard: ReturnType<Conn["guard"]["state"]>; legacy: boolean }[]> {
  await loadDataDb();
  return Object.entries(g.__wjDataDb?.modules ?? {}).map(([module, c]) => ({ module, url: c.url, client: c.client, guard: c.guard.state(), legacy: c.legacy }));
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

/** One module's row on Admin → DDBs. */
export interface ModuleDataDb {
  module: string;
  /** Where its data is read and written now. */
  home: "own" | "main";
  from: "environment" | "platform" | null;
  saved: { url: string; masked: string; enabled: boolean; savedAt: string; lastTest?: StoredDataDb["lastTest"]; lastCopy?: StoredDataDb["lastCopy"] } | null;
  /** A new DDB the module is moving to (current one stays live until it's switched to). */
  next: { url: string; masked: string; savedAt: string; lastTest?: StoredDataDb["lastTest"]; lastCopy?: StoredDataDb["lastCopy"] } | null;
  /** The module's rows may still be in another database (after a move or a switch on): "Free the old copy" clears them. */
  oldCopy: boolean;
  /** The saved key (or the pending move's) is a legacy service_role key, retired at the end of 2026. */
  legacyKey: boolean;
  /** Other modules saved with the same project: they share this DDB. */
  sharedWith: string[];
  /** The DDB's size, when on (the whole project, so a shared DDB shows the same size on each module). */
  sizeBytes: number | null;
  /** Rows here of modules that don't use this DDB: moved out with "evict". */
  foreignRows: number | null;
  tables: readonly string[];
}

const toSaved = (s: StoredDataDb | undefined): ModuleDataDb["saved"] => (s ? { url: s.url, masked: s.masked, enabled: s.enabled, savedAt: s.savedAt, lastTest: s.lastTest, lastCopy: s.lastCopy } : null);

/** The modules whose data is in the DDB at `url` now. */
function usersOf(url: string): string[] {
  return Object.entries(g.__wjDataDb?.modules ?? {})
    .filter(([, c]) => c.url === url)
    .map(([m]) => m);
}

/** Rows in a module's DDB of modules that don't use it (a DDB that used to hold every module's, 2026-11-01). */
async function foreignRows(module: string): Promise<number | null> {
  const c = g.__wjDataDb?.modules[module];
  if (!c) return null;
  const users = usersOf(c.url);
  let n = 0;
  for (const t of PER_MODULE) {
    const { count, error } = await c.client.from(t).select(KEY[t], { count: "exact", head: true }).not("module", "in", `(${users.join(",")})`);
    if (error) return null;
    n += count ?? 0;
  }
  return n;
}

/** Every module's DDB at a glance (Admin → DDBs): where its data is, its connection, who shares it, its size. */
export async function dataDbOverview(modules: readonly string[]): Promise<ModuleDataDb[]> {
  await loadDataDb(true);
  const mods = await storedModules();
  const sizes = new Map<string, Promise<number | null>>();
  const foreignByUrl = new Map<string, Promise<number | null>>();
  return Promise.all(
    modules.map(async (m) => {
      const c = g.__wjDataDb?.modules[m];
      const s = mods[m];
      if (c && !sizes.has(c.url)) sizes.set(c.url, usageOf(c.client).catch(() => null));
      if (c && !foreignByUrl.has(c.url)) foreignByUrl.set(c.url, Promise.race([foreignRows(m).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 4000))]));
      const sharedWith = s ? Object.entries(mods).filter(([o, d]) => o !== m && d.url === s.url).map(([o]) => o) : [];
      return {
        module: m,
        home: dataHome(m),
        from: c?.from ?? null,
        saved: toSaved(s),
        next: s?.next ? { url: s.next.url, masked: s.next.masked, savedAt: s.next.savedAt, lastTest: s.next.lastTest, lastCopy: s.next.lastCopy } : null,
        oldCopy: !!s?.previous,
        legacyKey: c?.legacy ?? isLegacyKey((s?.next ?? s)?.masked),
        sharedWith,
        sizeBytes: c ? await sizes.get(c.url)! : null,
        foreignRows: c ? await foreignByUrl.get(c.url)! : null,
        tables: tablesFor(m),
      };
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
 * Saves a module's connection. A project another module already uses is accepted: the modules share that DDB (a blank
 * key reuses the saved one). For a module whose DDB is on, a different project is a move: it's kept as `next` while the
 * current DDB stays live, and becomes the module's DDB when switched to (after Test and Copy). Otherwise it's saved
 * switched off. A new key replaces the old; leaving it blank keeps the one saved for that project.
 */
export async function saveDataDb(module: string, input: { url: string; key?: string }): Promise<{ ok: true; sharedWith: string[]; move: boolean; legacyKey: boolean } | { ok: false; message: string }> {
  if (!validModule(module)) return { ok: false, message: "Unknown module." };
  const url = input.url.trim().replace(/\/$/, "");
  if (!PROJECT_URL.test(url)) return { ok: false, message: "Use the project URL from Supabase → Project Settings → API (https://<project>.supabase.co)." };
  const mods = await storedModules();
  const prev = mods[module];
  const sharedWith = Object.entries(mods).filter(([m, d]) => m !== module && d.url === url).map(([m]) => m);
  const key = input.key?.trim();
  if (key && key.length < 30) return { ok: false, message: "That doesn't look like a secret key (sb_secret_…)." };
  // A blank key keeps the one saved for this project: the module's own, its pending move's, or a module sharing it.
  const known = [prev, prev?.next, ...sharedWith.map((m) => mods[m])].find((d) => d?.url === url);
  if (!key && !known) return { ok: false, message: "Paste the project's secret key (Supabase → Project Settings → API Keys → Secret keys, sb_secret_…)." };
  const keyCipher = key ? (await crypto()).encrypt(key) : known!.keyCipher;
  const masked = key ? mask(key) : known!.masked;
  const savedAt = new Date().toISOString();
  const move = !!prev?.enabled && prev.url !== url;
  let doc: StoredDataDb;
  if (move) doc = { ...prev!, next: { url, keyCipher, masked, savedAt } };
  else if (prev && prev.url === url) doc = { ...prev, keyCipher, masked, savedAt, next: undefined };
  else doc = { url, keyCipher, masked, enabled: false, savedAt, ...(prev?.previous ? { previous: prev.previous } : {}) };
  await store(module, doc);
  await loadDataDb(true);
  return { ok: true, sharedWith, move, legacyKey: isLegacyKey(masked) };
}

/** Drops a pending move; the module stays on its current DDB. */
export async function discardMove(module: string): Promise<void> {
  const s = await stored(module);
  if (s?.next) await store(module, { ...s, next: undefined });
}

/** The connection being set up: a pending move's, else the saved one. */
const setupOf = (s: StoredDataDb): DbConn => s.next ?? s;

/** Connects to a module's DDB being set up and checks every table exists (the setup script ran). Records the result. */
export async function testDataDb(module: string): Promise<StoredDataDb["lastTest"]> {
  const s = await stored(module);
  if (!s) return { at: new Date().toISOString(), ok: false, message: "Save the connection first." };
  const target = setupOf(s);
  const c = client(target.url, (await crypto()).decrypt(target.keyCipher));
  const tables: Record<string, number> = {};
  let message = "Connected; every table is there.";
  let ok = true;
  for (const t of DATA_TABLES) {
    const { count, error } = await c.from(t).select(KEY[t], { count: "exact", head: true });
    if (error) {
      ok = false;
      message = /PGRST205|does not exist|schema cache/i.test(`${error.code} ${error.message}`) ? `Table ${t} is missing: run the setup script in the new project's SQL editor.` : /JWT|401|invalid/i.test(error.message) ? "The key was refused: use the project's secret key (sb_secret_…), not the publishable one." : `Couldn't read ${t}: ${error.message}`;
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
  await store(module, s.next ? { ...s, next: { ...s.next, lastTest } } : { ...s, lastTest });
  return lastTest;
}

const PAGE = 500;

/**
 * Every database other than `except` that may hold this module's rows: the main one, every DDB in use, and the
 * module's previous DDB after a move. A copy reads from each in turn; "free the old copy" clears each.
 */
async function otherHomes(module: string, table: DataTable, except: string | null): Promise<(() => Query)[]> {
  const homes: (() => Query)[] = [];
  if (getSupabaseAdmin()) homes.push(() => mainFrom(table)!);
  if (!PER_MODULE.includes(table) && module !== LEGACY_MODULE) return homes;
  const seen = new Set<string>(except ? [except] : []);
  for (const c of Object.values(g.__wjDataDb?.modules ?? {})) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    homes.push(() => c.client.from(table) as unknown as Query);
  }
  const prev = (await stored(module))?.previous;
  // "main" marks a first switch on: the main database is already in the list.
  if (prev && prev.url !== "main" && !seen.has(prev.url)) {
    const c = client(prev.url, (await crypto()).decrypt(prev.keyCipher));
    homes.push(() => c.from(table) as unknown as Query);
  }
  return homes;
}

/**
 * Copies one page of one table, only this module's rows, into the DDB being set up (upsert, so running it again is
 * safe), from wherever they are now. `part` is which other database it reads from; the admin page calls it until done.
 */
export async function copyPage(module: string, table: DataTable, part: number, offset: number): Promise<{ copied: number; part: number; offset: number; done: boolean } | { error: string }> {
  if (!tablesFor(module).includes(table)) return { error: "Unknown table." };
  await loadDataDb();
  const s = await stored(module);
  if (!s) return { error: "Save the connection first." };
  const target = setupOf(s);
  if (!target.lastTest?.ok) return { error: "Test the connection first." };
  const homes = await otherHomes(module, table, target.url);
  if (part >= homes.length) return { copied: 0, part, offset: 0, done: true };
  let q = homes[part]().select("*");
  if (PER_MODULE.includes(table)) q = q.eq("module", module);
  const { data, error } = await q.order(KEY[table], { ascending: true }).range(offset, offset + PAGE - 1);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = data ?? [];
  if (rows.length) {
    const { error: e } = await client(target.url, (await crypto()).decrypt(target.keyCipher)).from(table).upsert(rows, { onConflict: KEY[table] });
    if (e) return { error: `Couldn't write ${table}: ${e.message}` };
  }
  const partDone = rows.length < PAGE;
  const done = partDone && part + 1 >= homes.length;
  if (done) {
    const now = (await stored(module)) ?? s;
    const t = setupOf(now);
    const lastCopy = { at: new Date().toISOString(), rows: { ...(t.lastCopy?.rows ?? {}), [table]: (part === 0 ? 0 : (t.lastCopy?.rows?.[table] ?? 0)) + offset + rows.length } };
    await store(module, now.next ? { ...now, next: { ...now.next, lastCopy } } : { ...now, lastCopy });
  }
  return { copied: rows.length, part: partDone ? part + 1 : part, offset: partDone ? 0 : offset + rows.length, done };
}

/**
 * Switches a module's data to its DDB (needs a passing test), or back to the main database. With a move pending, it
 * switches to the new DDB and remembers the old one, so "free the old copy" can remove the module's rows there.
 */
export async function setDataDbEnabled(module: string, enabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await stored(module);
  if (!s) return { ok: false, message: "Save the connection first." };
  if (enabled && s.next) {
    if (!s.next.lastTest?.ok) return { ok: false, message: "Test the new DDB first." };
    await store(module, { ...s.next, enabled: true, previous: { url: s.url, keyCipher: s.keyCipher } });
  } else {
    if (enabled && !s.lastTest?.ok) return { ok: false, message: "Test the connection first." };
    await store(module, { ...s, enabled, ...(enabled ? { previous: s.previous ?? { url: "main", keyCipher: "" } } : {}) });
  }
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
 * After switching a module to a DDB, deletes one batch of its rows from every other database (the main one, the other
 * DDBs in use, its previous DDB), freeing that space; other modules' rows there are untouched. Only while its DDB is
 * on, so nothing in use is deleted. When every table is clean the old copy is forgotten.
 */
export async function clearMainPage(module: string, table: DataTable): Promise<{ deleted: number; done: boolean } | { error: string }> {
  if (!tablesFor(module).includes(table)) return { error: "Unknown table." };
  await loadDataDb(true);
  const own = g.__wjDataDb?.modules[module];
  if (!own) return { error: "Switch on its DDB first." };
  let deleted = 0;
  for (const from of await otherHomes(module, table, own.url)) {
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
  const tables = tablesFor(module);
  if (table === tables[tables.length - 1]) {
    const s = await stored(module);
    if (s?.previous) await store(module, { ...s, previous: undefined });
  }
  return { deleted, done: true };
}

/**
 * Moves one batch of rows of modules that don't use this DDB out of it (the DDB set up on 2026-11-01 held every
 * module's): each row is written where its module keeps its data now (its DDB, or the main database), then deleted
 * here. Run until `done`; safe to run again.
 */
export async function evictPage(module: string, table: DataTable): Promise<{ moved: number; done: boolean } | { error: string }> {
  if (!PER_MODULE.includes(table)) return { moved: 0, done: true };
  await loadDataDb(true);
  const here = g.__wjDataDb?.modules[module];
  if (!here) return { error: "Switch on its DDB first." };
  const { data, error } = await here.client.from(table).select("*").not("module", "in", `(${usersOf(here.url).join(",")})`).order(KEY[table], { ascending: true }).limit(PAGE);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = (data ?? []) as Record<string, unknown>[];
  const byModule = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) byModule.set(String(r.module), [...(byModule.get(String(r.module)) ?? []), r]);
  for (const [m, list] of byModule) {
    const to = dataFrom(table, m);
    if (!to) return { error: "No main database." };
    const { error: e } = await to.upsert(list, { onConflict: KEY[table] });
    if (e) return { error: `Couldn't move ${m}'s ${table}: ${e.message}` };
    const ids = list.map((r) => String(r[KEY[table]]));
    for (let i = 0; i < ids.length; i += 200) {
      const { error: d } = await here.client.from(table).delete().in(KEY[table], ids.slice(i, i + 200));
      if (d) return { error: d.message };
    }
  }
  return { moved: rows.length, done: rows.length < PAGE };
}
