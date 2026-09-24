import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { jobsLakeStore } from "@/server/jobslake/store";

export const runtime = "nodejs";

/** The warm pool: canonical opportunities JobsLake has actually retrieved, newest first. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const sourceId = u.searchParams.get("sourceId") ?? "";
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const all = await jobsLakeStore().listOpportunities({ limit: 5000 });
  const matched = all.filter((o) => (!q || `${o.title} ${o.employer.name} ${o.locations.join(" ")}`.toLowerCase().includes(q)) && (!sourceId || o.sourceRecords.some((r) => r.sourceId === sourceId)));
  return json({ total: matched.length, offset, opportunities: matched.slice(offset, offset + limit) });
}
