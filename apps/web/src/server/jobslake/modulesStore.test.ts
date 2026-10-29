import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

/* A fake Supabase client that records every query chain, so the module filter can be checked on each one. */
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
};
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => client, touchTenant: async () => {} }));

import { __setJobsLakeStore, jobsLakeStore, opportunityRowId } from "./store";

const opp = { id: "opp_1", title: "t", employer: { name: "Acme" }, postedAt: null, freshness: { lastObservedAt: "2026-10-28T00:00:00Z" } } as unknown as CanonicalOpportunity;
const moduleOf = (e: Entry) => e.ops.filter(([op, a]) => op === "eq" && a[0] === "module").map(([, a]) => a[1]);

beforeEach(() => {
  __setJobsLakeStore(undefined);
  log = [];
});
afterEach(() => __setJobsLakeStore(undefined));

describe("Supabase WorksLake store: every source and posting query names its module", () => {
  it("reads default to Jobs and filter by module, both ways", async () => {
    const s = jobsLakeStore();
    await s.status(); // the probe
    log = [];
    await s.listSources();
    await s.listOpportunities();
    await s.getOpportunity("opp_1");
    await s.listSources("internships");
    await s.listOpportunities({ module: "internships" });
    await s.getOpportunity("opp_1", "internships");
    // getOpportunity makes two queries (by id, then by legacy id).
    expect(log.map(moduleOf)).toEqual([["jobs"], ["jobs"], ["jobs"], ["jobs"], ["internships"], ["internships"], ["internships"], ["internships"]]);
    // Another module's row is keyed module:id, so it can never be a Jobs row.
    expect(log[6].ops).toContainEqual(["eq", ["id", "internships:opp_1"]]);
    expect(log[2].ops).toContainEqual(["eq", ["id", "opp_1"]]);
  });

  it("writes carry the module; another module's rows never take a Jobs row's key", async () => {
    const s = jobsLakeStore();
    await s.status();
    log = [];
    await s.upsertOpportunities([opp]);
    await s.upsertOpportunities([opp], "events");
    await s.putSource({ id: "x", status: "active" } as never);
    expect(log[0].ops[0]).toEqual(["upsert", [[expect.objectContaining({ id: "opp_1", module: "jobs" })]]]);
    expect(log[1].ops[0]).toEqual(["upsert", [[expect.objectContaining({ id: "events:opp_1", module: "events" })]]]);
    expect(log[2].ops[0]).toEqual(["upsert", [expect.objectContaining({ id: "x", module: "jobs" })]]);
    expect(opportunityRowId("jobs", "a")).toBe("a");
  });
});
