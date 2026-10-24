import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { companyDirectory } from "@/server/jobslake/companies";

export const runtime = "nodejs";

/** JobsLake's company directory: a page of companies (most open roles first) with their facts, counts and H-1B totals. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  return json(await companyDirectory(q, limit, offset));
}
