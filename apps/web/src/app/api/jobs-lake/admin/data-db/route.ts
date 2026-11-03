import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { clearMainPage, copyPage, dataDbOverview, evictPage, removeDataDb, saveDataDb, setDataDbEnabled, tablesFor, testDataDb, type DataTable } from "@/server/dataDb";
import { DATA_DB_SCHEMA_SQL } from "@/server/dataDb/schema";
import { MODULE_IDS } from "@/modules/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every module's data database: where its data is, its connection (key masked), its size, and the setup script. Admin only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ modules: await dataDbOverview(MODULE_IDS), setupSql: DATA_DB_SCHEMA_SQL });
}

/**
 * For one module (`module`, a registered module's id): save · test · copy (one page) · clear (one batch of its old copy)
 * · evict (one batch of other modules' rows out of its database) · enable · disable · remove. Audited with the module,
 * never the key.
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = ((await readJson(req, 8_000)) ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const mod = typeof body.module === "string" && (MODULE_IDS as readonly string[]).includes(body.module) ? body.module : null;
  if (!mod) return jlError("INVALID_REQUEST", "Name a module.", 400);
  const table = String(body.table ?? "") as DataTable;
  const int = (v: unknown) => Math.max(0, Math.floor(Number(v ?? 0)) || 0);
  switch (action) {
    case "save": {
      const r = await saveDataDb(mod, { url: String(body.url ?? ""), key: typeof body.key === "string" ? body.key : undefined });
      await audit(a.actor, "datadb.saved", undefined, { module: mod, ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 400);
    }
    case "test": {
      const r = await testDataDb(mod);
      await audit(a.actor, "datadb.tested", undefined, { module: mod, ok: r?.ok ?? false });
      return json({ test: r });
    }
    case "copy":
    case "clear":
    case "evict": {
      if (!tablesFor(mod).includes(table)) return jlError("INVALID_REQUEST", "Name one of the module's data tables.", 400);
      const r = action === "copy" ? await copyPage(mod, table, int(body.part), int(body.offset)) : action === "clear" ? await clearMainPage(mod, table) : await evictPage(mod, table);
      if ("error" in r) return jlError("SOURCE_UNAVAILABLE", r.error, 409);
      if (r.done) await audit(a.actor, action === "copy" ? "datadb.copied" : action === "clear" ? "datadb.main_cleared" : "datadb.evicted", undefined, { module: mod, table });
      return json(r);
    }
    case "enable":
    case "disable": {
      const r = await setDataDbEnabled(mod, action === "enable");
      await audit(a.actor, `datadb.${action}d`, undefined, { module: mod, ok: r.ok });
      return r.ok ? json(r) : jlError("INVALID_REQUEST", r.message, 409);
    }
    case "remove": {
      await removeDataDb(mod);
      await audit(a.actor, "datadb.removed", undefined, { module: mod });
      return json({ ok: true });
    }
    default:
      return jlError("INVALID_REQUEST", "Unknown action.", 400);
  }
}
