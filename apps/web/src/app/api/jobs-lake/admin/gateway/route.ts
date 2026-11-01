import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { collectGatewaySource, gatewayOverview, registerPartner, setGatewaySource, uploadPartnerList } from "@/server/gateway/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The gateway's sources, runs and listings for platform admins (Platform → WorksLake → Gateway). */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await gatewayOverview());
}

const ID = /^src_[a-f0-9]{24}$/;
const MODULES = ["jobs", "internships", "teaching", "services", "therapists", "cofounders", "events", "marketplace", "scholarships"];

/**
 * Gateway actions for platform admins, each audited: "collect" (Collect now), "register" (a partner who gave written
 * permission), "upload" (its list), "activate" / "pause". Every one runs through the gateway's own checks.
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 2_300_000)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "collect";
  const sourceId = typeof body?.sourceId === "string" && ID.test(body.sourceId) ? body.sourceId : null;

  if (action === "collect") {
    if (!sourceId) return jlError("INVALID_REQUEST", "Name the gateway source to collect.", 400);
    const r = await collectGatewaySource(sourceId);
    await audit(a.actor, "gateway.collect", sourceId, { ok: r.ok, ...(r.ok ? { valid: r.valid } : { code: r.code }) });
    return json(r, r.ok ? 200 : 422);
  }
  if (action === "register") {
    const p = { name: String(body?.name ?? "").trim().slice(0, 120), website: String(body?.website ?? "").trim().slice(0, 300), module: String(body?.module ?? ""), permissionEvidence: String(body?.permissionEvidence ?? "").trim().slice(0, 500), consentVerified: body?.consentVerified === true };
    if (!p.name || !p.website || !MODULES.includes(p.module) || p.permissionEvidence.length < 8) return jlError("INVALID_REQUEST", "Give the partner's name, website (https://…), module and what permission they gave.", 400);
    const r = await registerPartner(p);
    await audit(a.actor, "gateway.partner_registered", undefined, { name: p.name, module: p.module, ok: r.status === 201 });
    return json(r.body, r.status);
  }
  if (!sourceId) return jlError("INVALID_REQUEST", "Name the gateway source.", 400);
  if (action === "upload") {
    const format = body?.format === "json" ? "json" : body?.format === "csv" ? "csv" : null;
    if (!format || typeof body?.content !== "string") return jlError("INVALID_REQUEST", "Upload a CSV or JSON file.", 400);
    const r = await uploadPartnerList(sourceId, format, body.content);
    await audit(a.actor, "gateway.partner_uploaded", sourceId, { ok: r.body.ok === true, rows: r.body.rows, valid: r.body.valid });
    return json(r.body, r.status);
  }
  if (action === "activate" || action === "pause") {
    const r = await setGatewaySource(sourceId, action);
    await audit(a.actor, `gateway.${action}`, sourceId, { ok: r.status === 200 });
    return json(r.body, r.status);
  }
  return jlError("INVALID_REQUEST", "Unknown action.", 400);
}
