import { afterEach, describe, expect, it } from "vitest";
import { checkScope, requireAdmin, requireConsumer } from "../../../../data-gateway/src/core.mjs";
import { __resetGatewayKeyRegistration, ensureGatewayKey, gatewayAdminToken, gatewayApiKey, gatewayBridgeOn, gatewayConfigured, gatewayCursorSecret, gatewayKeyDerived, gatewayUrl } from "./secrets";

const KEY = "k".repeat(40);
const SUPA = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
const base = { ...SUPA, SECRET_ENCRYPTION_KEY: KEY };

/** The gateway's key table, as its store would hold it: read and change. */
function fakeStore() {
  const state = { keys: [] as Record<string, unknown>[], consumers: [] as Record<string, unknown>[] };
  let changes = 0;
  return {
    state,
    changes: () => changes,
    read: async <T>(fn: (s: typeof state) => T) => fn(state),
    change: async <T>(fn: (s: typeof state) => T) => {
      changes++;
      return fn(state);
    },
  };
}

afterEach(() => __resetGatewayKeyRegistration());

describe("the gateway's secrets, derived from SECRET_ENCRYPTION_KEY (owner, 2026-11-06)", () => {
  it("derives three separate 32+ character values, the same every time for the same key", () => {
    const admin = gatewayAdminToken(base)!;
    const cursor = gatewayCursorSecret(base)!;
    const api = gatewayApiKey(base)!;
    expect(admin).toHaveLength(64);
    expect(cursor).toHaveLength(64);
    expect(new Set([admin, cursor, api.slice(4)]).size).toBe(3);
    expect(api).toMatch(/^wlg_[a-f0-9]{64}$/);
    expect(gatewayAdminToken({ ...base })).toBe(admin);
    expect(gatewayAdminToken({ ...base, SECRET_ENCRYPTION_KEY: "j".repeat(40) })).not.toBe(admin);
    // None of them carries the key itself.
    expect(`${admin}${cursor}${api}`).not.toContain(KEY);
  });

  it("a value the deployment sets still wins", () => {
    const env = { ...base, GATEWAY_ADMIN_TOKEN: "a".repeat(40), GATEWAY_CURSOR_SECRET: "c".repeat(40), WORKSLAKE_GATEWAY_API_KEY: `wlg_${"e".repeat(64)}`, WORKSLAKE_GATEWAY_URL: "https://gw.example.com/" };
    expect(gatewayAdminToken(env)).toBe("a".repeat(40));
    expect(gatewayCursorSecret(env)).toBe("c".repeat(40));
    expect(gatewayApiKey(env)).toBe(`wlg_${"e".repeat(64)}`);
    expect(gatewayKeyDerived(env)).toBe(false);
    expect(gatewayUrl(env)).toBe("https://gw.example.com");
  });

  it("stays off without Supabase or a usable key, and the bridge follows the gateway unless set", () => {
    expect(gatewayConfigured({ SECRET_ENCRYPTION_KEY: KEY })).toBe(false);
    expect(gatewayConfigured({ ...SUPA, SECRET_ENCRYPTION_KEY: "short" })).toBe(false);
    expect(gatewayUrl({ SECRET_ENCRYPTION_KEY: KEY })).toBe("");
    expect(gatewayConfigured(base)).toBe(true);
    expect(gatewayBridgeOn(base)).toBe(true);
    expect(gatewayBridgeOn({ ...base, WORKSLAKE_GATEWAY_ENABLED: "0" })).toBe(false);
    expect(gatewayBridgeOn({ SECRET_ENCRYPTION_KEY: KEY })).toBe(false);
  });

  it("the derived tokens pass the gateway's own admin check", () => {
    expect(() => requireAdmin(`Bearer ${gatewayAdminToken(base)}`, gatewayAdminToken(base))).not.toThrow();
  });

  it("registers the derived API key once, and the gateway's own lookup then accepts it for every module", async () => {
    const store = fakeStore();
    const key = gatewayApiKey(base)!;
    await expect(requireConsumer(store, `Bearer ${key}`)).rejects.toThrow(/Invalid or expired/);
    await ensureGatewayKey(store as never, base);
    await ensureGatewayKey(store as never, base);
    expect(store.changes()).toBe(1);
    expect(store.state.keys).toHaveLength(1);
    expect(JSON.stringify(store.state)).not.toContain(key);
    const found = await requireConsumer(store, `Bearer ${key}`);
    for (const m of ["jobs", "events", "scholarships"]) expect(() => checkScope(found, m)).not.toThrow();
    // A fresh process finds it already there and adds nothing.
    __resetGatewayKeyRegistration();
    await ensureGatewayKey(store as never, base);
    expect(store.state.keys).toHaveLength(1);
  });

  it("registers nothing when the deployment sets the key", async () => {
    const store = fakeStore();
    await ensureGatewayKey(store as never, { ...base, WORKSLAKE_GATEWAY_API_KEY: `wlg_${"e".repeat(64)}` });
    expect(store.changes()).toBe(0);
  });
});
