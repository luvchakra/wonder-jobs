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
/** Only a Supabase project URL: the server sends a service key there, so never an arbitrary host. */
export const PROJECT_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

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

interface Active {
  at: number;
  /** The data client when the data database is on; null when every table stays in the main database. */
  client: AdminClient | null;
  from: "environment" | "platform" | null;
}
const g = globalThis as unknown as { __wjDataDb?: Active; __wjDataDbLoading?: Promise<void> | null };
const TTL = 60_000;
// Its own guard: a struggling data database backs off without blocking the main one's requests.
const guard = createDbGuard();

function client(url: string, key: string): AdminClient {
  return createClient(url, key, { db: { schema: "public" }, auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guard.fetch } });
}

function fromEnv(): { url: string; key: string } | null {
  const url = process.env.WORKSLAKE_DATA_DB_URL?.trim().replace(/\/$/, "");
  const key = process.env.WORKSLAKE_DATA_DB_KEY?.trim();
  return url && key && PROJECT_URL.test(url) ? { url, key } : null;
}

/** Reads which database holds WorksLake's data (at most once a minute; concurrent callers share one read). */
export function loadDataDb(force = false): Promise<void> {
  const now = Date.now();
  if (!force && g.__wjDataDb && now - g.__wjDataDb.at < TTL) return Promise.resolve();
  if (g.__wjDataDbLoading && !force) return g.__wjDataDbLoading;
  const p = (async () => {
    const env = fromEnv();
    if (env) {
      g.__wjDataDb = { at: now, client: g.__wjDataDb?.from === "environment" && g.__wjDataDb.client ? g.__wjDataDb.client : client(env.url, env.key), from: "environment" };
      return;
    }
    try {
      const doc = (await (await state()).get(PLATFORM_TENANT, DOC))?.state as StoredDataDb | undefined;
      g.__wjDataDb = doc?.enabled && PROJECT_URL.test(doc.url) ? { at: now, client: client(doc.url, (await crypto()).decrypt(doc.keyCipher)), from: "platform" } : { at: now, client: null, from: null };
    } catch {
      // Keep what was there; with nothing loaded yet, stay on the main database.
      g.__wjDataDb = { at: now, client: g.__wjDataDb?.client ?? null, from: g.__wjDataDb?.from ?? null };
    }
  })().finally(() => {
    g.__wjDataDbLoading = null;
  });
  g.__wjDataDbLoading = p;
  return p;
}

/**
 * A query on one of WorksLake's data tables, in whichever database holds it now. Callers `await loadDataDb()` first
 * (entry points do); before the first load it is the main database. Null when no database is configured (tests).
 */
export function dataFrom(table: DataTable) {
  const data = g.__wjDataDb?.client;
  if (data) return data.from(table);
  const main = getSupabaseAdmin();
  return main ? main.schema("wonderjobs").from(table) : null;
}

/** The data database's own `db_usage` (its size), when it is on. */
export async function dataDbUsage(): Promise<{ dbBytes: number } | null> {
  await loadDataDb();
  const data = g.__wjDataDb?.client;
  if (!data) return null;
  const { data: d, error } = await data.rpc("db_usage");
  return error || !d ? null : { dbBytes: Number((d as { db_bytes: number }).db_bytes) };
}

/* ------------------------------------------------------------------ admin */

export interface DataDbStatus {
  /** Where WorksLake's data is read and written now. */
  active: "main" | "data";
  from: "environment" | "platform" | null;
  saved: { url: string; masked: string; enabled: boolean; savedAt: string; lastTest?: StoredDataDb["lastTest"]; lastCopy?: StoredDataDb["lastCopy"] } | null;
  tables: readonly string[];
}

async function stored(): Promise<StoredDataDb | undefined> {
  return (await (await state()).get(PLATFORM_TENANT, DOC))?.state as StoredDataDb | undefined;
}

export async function dataDbStatus(): Promise<DataDbStatus> {
  await loadDataDb(true);
  const s = await stored();
  return {
    active: g.__wjDataDb?.client ? "data" : "main",
    from: g.__wjDataDb?.from ?? null,
    saved: s ? { url: s.url, masked: s.masked, enabled: s.enabled, savedAt: s.savedAt, lastTest: s.lastTest, lastCopy: s.lastCopy } : null,
    tables: DATA_TABLES,
  };
}

const mask = (key: string) => `${key.slice(0, 6)}••••${key.slice(-4)}`;

/** Saves the connection, switched off. A new key replaces the old; leaving the key blank keeps it (same URL only). */
export async function saveDataDb(input: { url: string; key?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = input.url.trim().replace(/\/$/, "");
  if (!PROJECT_URL.test(url)) return { ok: false, message: "Use the project URL from Supabase → Project Settings → API (https://<project>.supabase.co)." };
  const prev = await stored();
  const key = input.key?.trim();
  if (!key && (!prev || prev.url !== url)) return { ok: false, message: "Paste the project's service role (secret) key." };
  if (key && key.length < 40) return { ok: false, message: "That doesn't look like a service role key." };
  const doc: StoredDataDb = key ? { url, keyCipher: (await crypto()).encrypt(key), masked: mask(key), enabled: false, savedAt: new Date().toISOString() } : { ...prev!, enabled: false, savedAt: new Date().toISOString() };
  await (await state()).put(PLATFORM_TENANT, DOC, doc);
  await loadDataDb(true);
  return { ok: true };
}

/** Connects to the saved data database and checks every table exists (the setup script ran). Records the result. */
export async function testDataDb(): Promise<StoredDataDb["lastTest"]> {
  const s = await stored();
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
  const lastTest = { at: new Date().toISOString(), ok, message, tables };
  await (await state()).put(PLATFORM_TENANT, DOC, { ...s, lastTest });
  return lastTest;
}

const PAGE = 500;

/**
 * Copies one page of one table from the main database into the data database (upsert, so running it again is safe).
 * The admin page calls it page after page until `done`, so no single request runs long.
 */
export async function copyPage(table: DataTable, offset: number): Promise<{ copied: number; done: boolean } | { error: string }> {
  if (!DATA_TABLES.includes(table)) return { error: "Unknown table." };
  const s = await stored();
  const main = getSupabaseAdmin();
  if (!s || !main) return { error: "Save the connection first." };
  if (!s.lastTest?.ok) return { error: "Test the connection first." };
  const { data, error } = await main.schema("wonderjobs").from(table).select("*").order(KEY[table], { ascending: true }).range(offset, offset + PAGE - 1);
  if (error) return { error: `Couldn't read ${table}: ${error.message}` };
  const rows = data ?? [];
  if (rows.length) {
    const { error: e } = await client(s.url, (await crypto()).decrypt(s.keyCipher)).from(table).upsert(rows, { onConflict: KEY[table] });
    if (e) return { error: `Couldn't write ${table}: ${e.message}` };
  }
  const done = rows.length < PAGE;
  if (done) await (await state()).put(PLATFORM_TENANT, DOC, { ...s, lastCopy: { at: new Date().toISOString(), rows: { ...(s.lastCopy?.rows ?? {}), [table]: offset + rows.length } } });
  return { copied: rows.length, done };
}

/** Switches WorksLake's data to the data database (needs a passing test) or back to the main one. */
export async function setDataDbEnabled(enabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await stored();
  if (!s) return { ok: false, message: "Save the connection first." };
  if (enabled && !s.lastTest?.ok) return { ok: false, message: "Test the connection first." };
  await (await state()).put(PLATFORM_TENANT, DOC, { ...s, enabled });
  await loadDataDb(true);
  return { ok: true };
}

/** Forgets the saved connection; WorksLake's data goes back to the main database. */
export async function removeDataDb(): Promise<void> {
  await (await state()).remove(PLATFORM_TENANT, DOC);
  await loadDataDb(true);
}

/** Tests only. */
export function __resetDataDb() {
  g.__wjDataDb = undefined;
  g.__wjDataDbLoading = null;
}

/**
 * After switching to the data database, deletes one batch of a table's old copy from the main database, freeing its
 * space for the app (Postgres reuses it). Only while the data database is on, so nothing in use is ever deleted.
 */
export async function clearMainPage(table: DataTable): Promise<{ deleted: number; done: boolean } | { error: string }> {
  if (!DATA_TABLES.includes(table)) return { error: "Unknown table." };
  await loadDataDb(true);
  if (!g.__wjDataDb?.client) return { error: "Switch to the data database first." };
  const main = getSupabaseAdmin();
  if (!main) return { error: "No main database." };
  const t = main.schema("wonderjobs").from(table);
  const { data, error } = await t.select(KEY[table]).limit(1000);
  if (error) return { error: error.message };
  const ids = (data ?? []).map((r) => (r as unknown as Record<string, string>)[KEY[table]]);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: e } = await main.schema("wonderjobs").from(table).delete().in(KEY[table], ids.slice(i, i + 200));
    if (e) return { error: e.message };
  }
  return { deleted: ids.length, done: ids.length < 1000 };
}
