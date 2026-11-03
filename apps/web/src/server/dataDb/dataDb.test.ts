import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDataDb, dataDbOverview, dataEvery, dataFrom, dataHome, loadDataDb, PROJECT_URL, removeDataDb, saveDataDb, setDataDbEnabled, tablesFor } from "./index";
import { DATA_DB_SCHEMA_SQL } from "./schema";
import { stateStore } from "../state";
import { PLATFORM_TENANT } from "../billing/plansConfig";

const URL_OK = "https://abcdefghijklmnopqrst.supabase.co";
const OTHER = "https://bbbbbbbbbbbbbbbbbbbb.supabase.co";
const KEY = "sb_secret_" + "x".repeat(40);

beforeEach(async () => {
  vi.stubEnv("SECRET_ENCRYPTION_KEY", "k".repeat(40));
  vi.stubEnv("WORKSLAKE_DATA_DB_URL", "");
  __resetDataDb();
  await stateStore.put(PLATFORM_TENANT, "wj.datadbs", null);
  await stateStore.put(PLATFORM_TENANT, "wj.datadb", null);
});
afterEach(() => vi.unstubAllEnvs());

const enabledDoc = async (url: string) => ({ url, keyCipher: (await import("../secrets")).encrypt(KEY), masked: "x", enabled: true, savedAt: new Date().toISOString(), lastTest: { at: "", ok: true, message: "" } });

describe("each module's own data database (owner, 2026-11-03)", () => {
  it("only accepts a Supabase project URL, since the server sends a service key there", async () => {
    expect(PROJECT_URL.test(URL_OK)).toBe(true);
    for (const bad of ["http://abcdefghijklmnopqrst.supabase.co", "https://evil.example.com", "https://abcdefghijklmnopqrst.supabase.co.evil.com", "https://x@abcdefghijklmnopqrst.supabase.co"]) {
      expect((await saveDataDb("events", { url: bad, key: KEY })).ok).toBe(false);
    }
  });

  it("stores a module's key encrypted and shows it only masked; a saved connection starts switched off", async () => {
    expect((await saveDataDb("therapists", { url: URL_OK, key: KEY })).ok).toBe(true);
    expect(JSON.stringify((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state)).not.toContain(KEY);
    const [row] = await dataDbOverview(["therapists"]);
    expect(row).toMatchObject({ module: "therapists", home: "main", saved: { url: URL_OK, enabled: false } });
    expect(row.saved?.masked).not.toContain(KEY.slice(10, 40));
  });

  it("needs a key for a new URL, keeps the saved one when left blank, and won't switch on before a passing test", async () => {
    expect((await saveDataDb("events", { url: URL_OK })).ok).toBe(false);
    await saveDataDb("events", { url: URL_OK, key: KEY });
    expect((await saveDataDb("events", { url: URL_OK })).ok).toBe(true);
    expect(await setDataDbEnabled("events", true)).toMatchObject({ ok: false });
    expect(dataHome("events")).toBe("main");
  });

  it("lets modules share a DDB: the same project is accepted, and a blank key reuses the saved one (2026-11-03)", async () => {
    await saveDataDb("therapists", { url: URL_OK, key: KEY });
    expect(await saveDataDb("events", { url: URL_OK })).toMatchObject({ ok: true, sharedWith: ["therapists"], move: false });
    const rows = await dataDbOverview(["therapists", "events", "jobs"]);
    expect(rows.map((r) => r.sharedWith)).toEqual([["events"], ["therapists"], []]);
    // A project nobody uses still needs its key.
    expect((await saveDataDb("jobs", { url: OTHER })).ok).toBe(false);
  });

  it("moves a module to a new DDB without cutting it over: the new one waits until it's tested and switched to (2026-11-03)", async () => {
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", { modules: { therapists: await enabledDoc(URL_OK), events: await enabledDoc(URL_OK) } });
    await loadDataDb(true);
    expect(await saveDataDb("therapists", { url: OTHER, key: KEY })).toMatchObject({ ok: true, move: true });
    // Still on the old (shared) DDB until the switch. (Read from the setting: the overview would ask the DDBs.)
    const saved = async () => ((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state as { modules: Record<string, Record<string, unknown>> }).modules;
    expect((await saved()).therapists).toMatchObject({ url: URL_OK, enabled: true, next: { url: OTHER } });
    expect(dataHome("therapists")).toBe("own");
    expect(await setDataDbEnabled("therapists", true)).toMatchObject({ ok: false }); // the new DDB isn't tested
    // Once tested, switching moves it and remembers the old DDB so its rows there can be freed.
    const mods = ((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state as { modules: Record<string, { next: object }> }).modules;
    mods.therapists.next = { ...mods.therapists.next, lastTest: { at: "", ok: true, message: "" } };
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", { modules: mods });
    expect(await setDataDbEnabled("therapists", true)).toEqual({ ok: true });
    const after = await saved();
    expect(after.therapists).toMatchObject({ url: OTHER, enabled: true, previous: { url: URL_OK } });
    expect(after.therapists.next).toBeUndefined();
    // Events stays on the DDB it shared.
    expect(after.events).toMatchObject({ url: URL_OK, enabled: true });
  });

  it("drops a pending move on request; the module stays where it is", async () => {
    const { discardMove } = await import("./index");
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", { modules: { therapists: await enabledDoc(URL_OK) } });
    await saveDataDb("therapists", { url: OTHER, key: KEY });
    await discardMove("therapists");
    const mods = ((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state as { modules: Record<string, Record<string, unknown>> }).modules;
    expect(mods.therapists).toMatchObject({ url: URL_OK, enabled: true });
    expect(mods.therapists.next).toBeUndefined();
  });

  it("routes a module's data only to its own database once on; a module without one uses the main database, never another's", async () => {
    await stateStore.put(PLATFORM_TENANT, "wj.datadbs", { modules: { therapists: await enabledDoc(URL_OK) } });
    await loadDataDb(true);
    expect(dataHome("therapists")).toBe("own");
    expect(dataHome("events")).toBe("main");
    // No main database in tests: only the module with its own database gets a query.
    expect(dataFrom("gateway_listings", "therapists")).not.toBeNull();
    expect(dataFrom("gateway_listings", "events")).toBeNull();
    expect(dataEvery("gateway_listings").map((d) => d.modules)).toEqual([["therapists"]]);
  });

  it("the data database set up before (2026-11-01) is Jobs' own, and only Jobs' (no shared fallback)", async () => {
    await stateStore.put(PLATFORM_TENANT, "wj.datadb", await enabledDoc(URL_OK));
    await loadDataDb(true);
    expect(dataHome("jobs")).toBe("own");
    expect(dataHome("events")).toBe("main");
    expect(dataFrom("gateway_listings", "events")).toBeNull();
    // Another module may share the legacy DDB.
    expect(await saveDataDb("events", { url: URL_OK })).toMatchObject({ ok: true, sharedWith: ["jobs"] });
    // Jobs' first change folds the legacy setting into its own entry.
    await setDataDbEnabled("jobs", false);
    expect((await stateStore.get(PLATFORM_TENANT, "wj.datadb"))?.state ?? null).toBeNull();
    expect((await stateStore.get(PLATFORM_TENANT, "wj.datadbs"))?.state).toMatchObject({ modules: { jobs: { url: URL_OK, enabled: false } } });
    await removeDataDb("jobs");
    expect(dataHome("jobs")).toBe("main");
  });

  it("names what each module's database holds: Jobs also its H-1B employers", () => {
    expect(tablesFor("therapists")).toEqual(["jobslake_opportunities", "gateway_listings"]);
    expect(tablesFor("jobs")).toContain("jobslake_h1b_employers");
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
    const { dataWritable } = await import("./index");
    __resetDataDb();
    const spy = vi.spyOn(stateStore, "get").mockRejectedValueOnce(new Error("database busy"));
    await loadDataDb(true);
    expect(dataWritable()).toBe(false);
    spy.mockRestore();
    await loadDataDb(true);
    expect(dataWritable()).toBe(true);
  });
});
