import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDataDb, dataDbStatus, dataFrom, PROJECT_URL, removeDataDb, saveDataDb, setDataDbEnabled } from "./index";
import { DATA_DB_SCHEMA_SQL } from "./schema";
import { stateStore } from "../state";
import { PLATFORM_TENANT } from "../billing/plansConfig";

const URL_OK = "https://abcdefghijklmnopqrst.supabase.co";
const KEY = "sb_secret_" + "x".repeat(40);

describe("optional WorksLake data database", () => {
  beforeEach(async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
    vi.stubEnv("WORKSLAKE_DATA_DB_URL", "");
    __resetDataDb();
    await removeDataDb();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("only accepts a Supabase project URL, since the server sends a service key there", async () => {
    expect(PROJECT_URL.test(URL_OK)).toBe(true);
    for (const bad of ["http://abcdefghijklmnopqrst.supabase.co", "https://evil.example.com", "https://abcdefghijklmnopqrst.supabase.co.evil.com", "https://x@abcdefghijklmnopqrst.supabase.co"]) {
      expect((await saveDataDb({ url: bad, key: KEY })).ok).toBe(false);
    }
  });

  it("stores the key encrypted and shows it only masked; saved connections start switched off", async () => {
    expect((await saveDataDb({ url: URL_OK, key: KEY })).ok).toBe(true);
    const raw = JSON.stringify((await stateStore.get(PLATFORM_TENANT, "wj.datadb"))?.state);
    expect(raw).not.toContain(KEY);
    const s = await dataDbStatus();
    expect(s).toMatchObject({ active: "main", saved: { url: URL_OK, enabled: false } });
    expect(s.saved?.masked).not.toContain(KEY.slice(10, 40));
  });

  it("needs a key for a new URL, and keeps the saved one when left blank", async () => {
    expect((await saveDataDb({ url: URL_OK })).ok).toBe(false);
    await saveDataDb({ url: URL_OK, key: KEY });
    expect((await saveDataDb({ url: URL_OK })).ok).toBe(true);
    expect((await saveDataDb({ url: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" })).ok).toBe(false);
  });

  it("won't switch on before a passing test, so a search never reads an empty database", async () => {
    await saveDataDb({ url: URL_OK, key: KEY });
    expect(await setDataDbEnabled(true)).toMatchObject({ ok: false });
    expect((await dataDbStatus()).active).toBe("main");
  });

  it("keeps every table in the main database while switched off (no Supabase in tests: nothing to query)", () => {
    expect(dataFrom("jobslake_opportunities")).toBeNull();
  });

  it("the setup script creates every data table with row-level security and no access for anon", () => {
    for (const t of ["jobslake_opportunities", "jobslake_search_cache", "jobslake_h1b_employers", "gateway_listings"]) expect(DATA_DB_SCHEMA_SQL).toContain(`create table if not exists public.${t}`);
    expect(DATA_DB_SCHEMA_SQL).toContain("enable row level security");
    expect(DATA_DB_SCHEMA_SQL).toContain("revoke all on public.%I from anon, authenticated");
  });
});

describe("when the data database setting can't be read", () => {
  afterEach(() => vi.restoreAllMocks());
  it("writes nothing until it knows where the data lives, instead of assuming the main database", async () => {
    const { dataWritable, loadDataDb, __resetDataDb } = await import("./index");
    __resetDataDb();
    const spy = vi.spyOn(stateStore, "get").mockRejectedValueOnce(new Error("database busy"));
    await loadDataDb(true);
    expect(dataWritable()).toBe(false);
    spy.mockRestore();
    await loadDataDb(true);
    expect(dataWritable()).toBe(true);
  });
});

describe("each module's own data database (owner, 2026-11-03)", () => {
  const OTHER = "https://bbbbbbbbbbbbbbbbbbbb.supabase.co";
  beforeEach(async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
    vi.stubEnv("WORKSLAKE_DATA_DB_URL", "");
    __resetDataDb();
    await removeDataDb();
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("saves a module's connection on its own, encrypted and switched off, without touching the shared one", async () => {
    expect((await saveDataDb({ url: URL_OK, key: KEY }, "therapists")).ok).toBe(true);
    expect(JSON.stringify((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state)).not.toContain(KEY);
    expect(await dataDbStatus("therapists")).toMatchObject({ target: "therapists", active: "main", saved: { url: URL_OK, enabled: false } });
    expect((await dataDbStatus()).saved).toBeNull();
    expect(await setDataDbEnabled(true, "therapists")).toMatchObject({ ok: false });
  });

  it("won't give two modules (or a module and the shared database) the same project, so no data mixes", async () => {
    await saveDataDb({ url: URL_OK, key: KEY }, "therapists");
    expect(await saveDataDb({ url: URL_OK, key: KEY }, "events")).toMatchObject({ ok: false, message: expect.stringContaining("therapists") });
    await saveDataDb({ url: OTHER, key: KEY });
    expect(await saveDataDb({ url: OTHER, key: KEY }, "events")).toMatchObject({ ok: false, message: expect.stringContaining("shared") });
  });

  it("routes a module's data to its own database once switched on, and every other module's elsewhere", async () => {
    const { encrypt } = await import("../secrets");
    const doc = { url: URL_OK, keyCipher: encrypt(KEY), masked: "x", enabled: true, savedAt: new Date().toISOString(), lastTest: { at: "", ok: true, message: "" } };
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", { modules: { therapists: doc } });
    const { loadDataDb, dataHome, dataEvery, tablesFor } = await import("./index");
    await loadDataDb(true);
    expect(dataHome("therapists")).toBe("own");
    expect(dataHome("events")).toBe("main");
    // No main database in tests: only the module with its own database gets a query.
    expect(dataFrom("gateway_listings", "therapists")).not.toBeNull();
    expect(dataFrom("gateway_listings", "events")).toBeNull();
    expect(dataEvery("gateway_listings").map((d) => d.modules)).toEqual([["therapists"]]);
    expect(tablesFor("therapists")).toEqual(["jobslake_opportunities", "gateway_listings"]);
    expect(tablesFor("jobs")).toContain("jobslake_h1b_employers");
  });
});
