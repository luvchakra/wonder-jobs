import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { clearMainPage, copyPage, dataDbOverview, dataDbStatus, dataDbUsage, removeDataDb, saveDataDb, setDataDbEnabled, tablesFor, testDataDb, type DataTable, type DataTarget } from "@/server/dataDb";
import { MODULE_IDS } from "@/modules/registry";
import { DATA_DB_SCHEMA_SQL } from "@/server/dataDb/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "shared" or a registered module's id; anything else is refused. */
function targetOf(v: unknown): DataTarget | null {
  const t = typeof v === "string" && v ? v : "shared";
  return t === "shared" || (MODULE_IDS as readonly string[]).includes(t) ? t : null;
}

/**
 * A data database (the shared one, or a module's own with ?module=<id>): where its data is now, the saved connection
 * (key masked), its size and the setup script; with every module's data home for the overview. Admin only.
 */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const target = targetOf(new URL(req.url).searchParams.get("module"));
  if (!target) return jlError("INVALID_REQUEST", "Unknown module.", 400);
  const [status, usage, modules] = await Promise.all([dataDbStatus(target), dataDbUsage(target).catch(() => null), dataDbOverview(MODULE_IDS)]);
  return json({ ...status, usage, modules, setupSql: DATA_DB_SCHEMA_SQL });
}

/** save · test · copy (one page) · clear (one batch of the main copy) · enable · disable · remove. Audited (never the key). */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = ((await readJson(req, 8_000)) ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const table = String(body.table ?? "") as DataTable;
  const target = targetOf(body.module);
  if (!target) return jlError("INVALID_REQUEST", "Unknown module.", 400);
  const offset = Math.max(0, Math.floor(Number(body.offset ?? 0)) || 0);
  switch (action) {
    case "save": {
      const r = await saveDataDb({ url: String(body.url ?? ""), key: typeof body.key === "string" ? body.key : undefined }, target);
      await audit(a.actor, "datadb.saved", undefined, { module: target, ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 400);
    }
    case "test": {
      const r = await testDataDb(target);
      await audit(a.actor, "datadb.tested", undefined, { module: target, ok: r?.ok ?? false });
      return json({ test: r });
    }
    case "copy":
    case "clear": {
      if (!tablesFor(target).includes(table)) return jlError("INVALID_REQUEST", "Name a WorksLake data table.", 400);
      const r = action === "copy" ? await copyPage(table, offset, target) : await clearMainPage(table, target);
      if ("error" in r) return jlError("SOURCE_UNAVAILABLE", r.error, 409);
      if (r.done) await audit(a.actor, action === "copy" ? "datadb.copied" : "datadb.main_cleared", undefined, { module: target, table });
      return json(r);
    }
    case "enable":
    case "disable": {
      const r = await setDataDbEnabled(action === "enable", target);
      await audit(a.actor, `datadb.${action}d`, undefined, { module: target, ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 409);
    }
    case "remove": {
      await removeDataDb(target);
      await audit(a.actor, "datadb.removed", undefined, { module: target });
      return json({ ok: true });
    }
    default:
      return jlError("INVALID_REQUEST", "Unknown action.", 400);
  }
}
