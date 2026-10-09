import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A fake Supabase client that records every query chain, so the tenant filter can be checked explicitly (RLS won't catch a missing one). */
type Entry = { table: string; ops: [string, unknown[]][] };
let log: Entry[];
function chain(entry: Entry): unknown {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res, rej);
        return (...args: unknown[]) => {
          entry.ops.push([String(prop), args]);
          return chain(entry);
        };
      },
    },
  );
}
const client: Record<string, unknown> = {
  schema: () => client,
  from: (table: string) => {
    const e: Entry = { table, ops: [] };
    log.push(e);
    return chain(e);
  },
  rpc: (fn: string, args: unknown) => {
    log.push({ table: `rpc:${fn}`, ops: [["rpc", [args]]] });
    return Promise.resolve({ data: 12, error: null });
  },
};
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => client, touchTenant: async () => {} }));

import { __setApiStore, apiStore } from "./apiStore";

const OWNER = "tenant-a";
const ownerFiltered = (e: Entry) => e.ops.some(([op, args]) => op === "eq" && args[0] === "owner_id" && args[1] === OWNER);

beforeEach(() => {
  log = [];
  __setApiStore(undefined);
});
afterEach(() => __setApiStore(undefined));

describe("Supabase API store: every owner-scoped query filters by owner_id", () => {
  it("keys, usage and billing reads and writes", async () => {
    const s = apiStore();
    await s.listKeys(OWNER);
    await s.revokeKey(OWNER, "key_abcdef", "2026-10-09T00:00:00Z");
    await s.touchKey(OWNER, "key_abcdef", "2026-10-09T00:00:00Z");
    await s.usage(OWNER, "2026-10-01");
    await s.markReported(OWNER, "2026-10-08", 3);
    await s.getBilling(OWNER);
    const scoped = log.filter((e) => !e.table.startsWith("rpc:"));
    expect(scoped).toHaveLength(6);
    for (const e of scoped) expect(ownerFiltered(e), `${e.table} ${JSON.stringify(e.ops)}`).toBe(true);
    // Revoking also requires the key id and an unrevoked key.
    const revoke = scoped[1];
    expect(revoke.ops).toContainEqual(["eq", ["id", "key_abcdef"]]);
    expect(revoke.ops).toContainEqual(["is", ["revoked_at", null]]);
  });

  it("writes carry the owner as a column", async () => {
    const s = apiStore();
    await s.createKey({ id: "key_abcdef", ownerId: OWNER, name: "n", prefix: "jl_live_abcd", keyHash: "h", createdAt: "2026-10-09T00:00:00Z" });
    await s.putBilling({ ownerId: OWNER, status: "inactive", updatedAt: "2026-10-09T00:00:00Z" });
    expect(log[0].ops[0]).toEqual(["insert", [expect.objectContaining({ owner_id: OWNER, key_hash: "h" })]]);
    expect(log[0].ops[0][1]).not.toContainEqual(expect.objectContaining({ key: expect.anything() }));
    expect(log[1].ops[0]).toEqual(["upsert", [expect.objectContaining({ owner_id: OWNER }), { onConflict: "owner_id" }]]);
  });

  it("meters through the atomic function with the owner", async () => {
    expect(await apiStore().meter(OWNER, "2026-10-09", 1)).toBe(12);
    expect(log[0]).toEqual({ table: "rpc:jobslake_api_meter", ops: [["rpc", [{ owner: OWNER, d: "2026-10-09", n: 1 }]]] });
  });

  it("authentication looks a key up by its hash only", async () => {
    await apiStore().findKeyByHash("abc");
    expect(log[0].ops).toContainEqual(["eq", ["key_hash", "abc"]]);
  });
});
