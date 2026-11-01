import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { adminLogo, companyDirectory } from "@/server/jobslake/companies";

export const runtime = "nodejs";

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
  const body = (await readJson(req, 400_000)) as { domain?: unknown; action?: unknown; type?: unknown; data?: unknown } | null;
  const domain = typeof body?.domain === "string" ? body.domain.slice(0, 200) : "";
  const kind = body?.action;
  if (!domain || (kind !== "refetch" && kind !== "upload" && kind !== "clear")) return jlError("INVALID_REQUEST", "Name the company's domain and refetch, upload or clear.", 400);
  if (kind === "upload" && (typeof body?.type !== "string" || typeof body?.data !== "string")) return jlError("INVALID_REQUEST", "An upload needs the image's type and data.", 400);
  const r = await adminLogo(domain, kind === "upload" ? { kind, type: String(body!.type), base64: String(body!.data) } : { kind });
  await audit(a.actor, `company.logo_${kind}`, undefined, { domain, ok: r.ok });
  return json(r, r.ok ? 200 : 422);
}
