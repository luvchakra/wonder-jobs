import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The import writes each module's rows only to that module's DDB (owner, 2026-11-03: "ensure that import job updates
 * new data in correct module specific ddb"). The DDB layer is replaced by a recorder: every write says which table and
 * which module's DDB it went to.
 */
const writes: { table: string; module: string; ids: string[] }[] = [];
const loads: number[] = [];

function builder(table: string, module: string) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === "upsert")
        return (rows: { id?: string }[]) => {
          writes.push({ table, module, ids: rows.map((r) => String(r.id)) });
          return Promise.resolve({ error: null });
        };
      if (prop === "then") return (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 });
      return () => self;
    },
  });
  return self;
}

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => ({ schema: () => ({ from: () => builder("main", "main") }) }) }));
vi.mock("@/server/dataDb", () => ({
  WRITE_FRESH_MS: 10_000,
  loadDataDb: (_force?: boolean, maxAge?: number) => {
    loads.push(maxAge ?? 60_000);
    return Promise.resolve();
  },
  dataWritable: () => true,
  dataFrom: (table: string, module = "jobs") => builder(table, module),
  dataEvery: (table: string) => [{ modules: "main", from: () => builder(table, "main") }],
}));

beforeEach(() => {
  writes.length = 0;
  loads.length = 0;
});

const listing = (id: string, module: string) => ({ id, sourceId: "src_a", module, title: "T", organization: "O", location: "", description: "", canonicalUrl: `https://a.example.org/${id}`, publishedAt: null, observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), remote: false, attributes: {}, status: "active", sourceName: "A", sourceMethod: "json_api" });

describe("the import writes each module's rows to that module's DDB only", () => {
  it("gateway listings from one collection are split by module", async () => {
    const { GatewayListingsTable } = await import("./store");
    await new GatewayListingsTable().upsert([listing("e1", "events"), listing("t1", "therapists"), listing("e2", "events")] as never);
    expect(writes.map((w) => [w.table, w.module, w.ids])).toEqual([
      ["gateway_listings", "events", ["e1", "e2"]],
      ["gateway_listings", "therapists", ["t1"]],
    ]);
    // A write re-reads a setting older than 10 s, so a module just moved to a new DDB isn't written to the old one.
    expect(loads).toContain(10_000);
  });

  it("the refresh's listings go to the module they were refreshed for", async () => {
    const { jobsLakeStore } = await import("@/server/jobslake/store");
    const opp = { id: "o1", title: "T", employer: { name: "E" }, postedAt: null, freshness: { lastObservedAt: new Date().toISOString() }, sourceRecords: [] };
    await jobsLakeStore().upsertOpportunities([opp] as never, "services");
    const w = writes.find((x) => x.table === "jobslake_opportunities");
    expect(w?.module).toBe("services");
    expect(loads).toContain(10_000);
  });
});
