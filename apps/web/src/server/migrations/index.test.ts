import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./index";

describe("migration registry", () => {
  it("matches the SQL files on disk", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(MIGRATIONS.map((m) => m.name)).toEqual(files);
    for (const m of MIGRATIONS) expect(m.sql).toBe(fs.readFileSync(path.join(dir, m.name), "utf8"));
  });
});
