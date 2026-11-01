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
