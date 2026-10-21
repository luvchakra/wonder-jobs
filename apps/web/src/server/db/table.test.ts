import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null }));
import { resetTablesForTests, table } from "./table";

type Row = { tenant_id: string; headline: string };
beforeEach(() => resetTablesForTests());

describe("table", () => {
  it("upsert inserts, then replaces the row with the same key, in one step", async () => {
    const t = table<Row>("t_upsert");
    await t.upsert({ tenant_id: "a", headline: "first" }, ["tenant_id"]);
    await t.upsert({ tenant_id: "b", headline: "other" }, ["tenant_id"]);
    await t.upsert({ tenant_id: "a", headline: "second" }, ["tenant_id"]);
    expect(await t.find({ tenant_id: "a" })).toEqual([{ tenant_id: "a", headline: "second" }]);
    expect(await t.find({ tenant_id: "b" })).toHaveLength(1);
  });

  it("refuses unfiltered reads, updates and deletes", async () => {
    const t = table<Row>("t_where");
    await expect(t.find({})).rejects.toThrow(/unfiltered/);
    await expect(t.update({}, { headline: "x" })).rejects.toThrow(/unfiltered/);
    await expect(t.remove({})).rejects.toThrow(/unfiltered/);
  });
});
