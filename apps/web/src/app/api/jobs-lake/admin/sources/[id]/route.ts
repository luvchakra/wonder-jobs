import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { removeSource, updateSource } from "@/server/jobslake/admin";
import { healthBySource } from "@/server/jobslake/core";
import { badJson, json, readJson, send } from "@/server/jobslake/http";
import { getSource } from "@/server/jobslake/registry";
import { jobsLakeStore } from "@/server/jobslake/store";
import { sourceView } from "@/server/jobslake/views";
import { deriveAlerts } from "@/domain/jobslake/health";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** One source with its runs, alerts and audit trail — everything the source detail tabs show. */
export async function GET(_req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const { id } = await ctx.params;
  const src = await getSource(id);
  if (!src) return send({ ok: false, status: 404, error: { code: "NOT_FOUND", message: "No such source.", retryable: false } });
  const store = jobsLakeStore();
  const [health, runs, auditTrail] = await Promise.all([healthBySource(), store.listRuns({ sourceId: id, limit: 100 }), store.listAudit(50, id)]);
  return json({ source: await sourceView(src, health), runs, alerts: deriveAlerts(src.id, src.name, runs), audit: auditTrail });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (body === null) return badJson();
  const r = await updateSource((await ctx.params).id, body, a.actor);
  if (!r.ok) return send(r);
  return json({ source: await sourceView(r.value, await healthBySource()) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return send(await removeSource((await ctx.params).id, a.actor));
}
