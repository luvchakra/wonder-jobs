import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { clearMainPage, copyPage, DATA_TABLES, dataDbStatus, dataDbUsage, removeDataDb, saveDataDb, setDataDbEnabled, testDataDb, type DataTable } from "@/server/dataDb";
import { DATA_DB_SCHEMA_SQL } from "@/server/dataDb/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The optional WorksLake data database: where WorksLake's data is now, the saved connection (key masked), its size and the setup script. Admin only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [status, usage] = await Promise.all([dataDbStatus(), dataDbUsage().catch(() => null)]);
  return json({ ...status, usage, setupSql: DATA_DB_SCHEMA_SQL });
}

/** save · test · copy (one page) · clear (one batch of the main copy) · enable · disable · remove. Audited (never the key). */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = ((await readJson(req, 8_000)) ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const table = String(body.table ?? "") as DataTable;
  const offset = Math.max(0, Math.floor(Number(body.offset ?? 0)) || 0);
  switch (action) {
    case "save": {
      const r = await saveDataDb({ url: String(body.url ?? ""), key: typeof body.key === "string" ? body.key : undefined });
      await audit(a.actor, "datadb.saved", undefined, { ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 400);
    }
    case "test": {
      const r = await testDataDb();
      await audit(a.actor, "datadb.tested", undefined, { ok: r?.ok ?? false });
      return json({ test: r });
    }
    case "copy":
    case "clear": {
      if (!DATA_TABLES.includes(table)) return jlError("INVALID_REQUEST", "Name a WorksLake data table.", 400);
      const r = action === "copy" ? await copyPage(table, offset) : await clearMainPage(table);
      if ("error" in r) return jlError("SOURCE_UNAVAILABLE", r.error, 409);
      if (r.done) await audit(a.actor, action === "copy" ? "datadb.copied" : "datadb.main_cleared", undefined, { table });
      return json(r);
    }
    case "enable":
    case "disable": {
      const r = await setDataDbEnabled(action === "enable");
      await audit(a.actor, `datadb.${action}d`, undefined, { ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 409);
    }
    case "remove": {
      await removeDataDb();
      await audit(a.actor, "datadb.removed", undefined, {});
      return json({ ok: true });
    }
    default:
      return jlError("INVALID_REQUEST", "Unknown action.", 400);
  }
}
