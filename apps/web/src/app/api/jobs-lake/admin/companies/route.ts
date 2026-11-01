import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { adminLogo, companyDirectory, fetchMissingLogos } from "@/server/jobslake/companies";

export const runtime = "nodejs";
export const maxDuration = 60;

/** WorksLake's company directory: a page of companies (most open roles first) with their facts, counts, H-1B totals and whether each has a logo. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  return json(await companyDirectory(q, limit, offset, undefined, { missingLogo: u.searchParams.get("missing") === "1" }));
}

/** An admin's logo change for one company or event poster: fetch it again, upload a file, or remove it. Audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 400_000)) as { domain?: unknown; action?: unknown; type?: unknown; data?: unknown; since?: unknown } | null;
  // "Fetch all missing logos": one pass over the companies still without one; the page calls again while some are left.
  if (body?.action === "fetch_missing") {
    const since = typeof body.since === "string" && !Number.isNaN(Date.parse(body.since)) && Date.parse(body.since) <= Date.now() ? new Date(body.since).toISOString() : new Date().toISOString();
    const r = await fetchMissingLogos(since);
    await audit(a.actor, "company.logo_fetch_missing", undefined, { checked: r.checked, found: r.found });
    return json(r);
  }
  const domain = typeof body?.domain === "string" ? body.domain.slice(0, 200) : "";
  const kind = body?.action;
  if (!domain || (kind !== "refetch" && kind !== "upload" && kind !== "clear")) return jlError("INVALID_REQUEST", "Name the company's domain and refetch, upload or clear.", 400);
  if (kind === "upload" && (typeof body?.type !== "string" || typeof body?.data !== "string")) return jlError("INVALID_REQUEST", "An upload needs the image's type and data.", 400);
  const r = await adminLogo(domain, kind === "upload" ? { kind, type: String(body!.type), base64: String(body!.data) } : { kind });
  await audit(a.actor, `company.logo_${kind}`, undefined, { domain, ok: r.ok });
  // A refusal carries its reason the way the admin pages read errors, so the page shows why, not "Request failed".
  return json(r.ok ? r : { ...r, error: { code: "LOGO_NOT_CHANGED", message: r.message } }, r.ok ? 200 : 422);
}
