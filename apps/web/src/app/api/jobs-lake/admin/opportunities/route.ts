import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { jobsLakeStore } from "@/server/jobslake/store";
import { JOB_TYPES, jobTypeOf, type JobType } from "@/domain/jobs/jobType";

export const runtime = "nodejs";

/** The warm pool: canonical opportunities WorksLake has actually retrieved, newest first. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const sourceId = u.searchParams.get("sourceId") ?? "";
  // A job type, or "unstated" for postings that state none.
  const type = u.searchParams.get("type") ?? "";
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const all = await jobsLakeStore().listOpportunities({ limit: 5000 });
  const typeOf = (o: (typeof all)[number]) => jobTypeOf(o) ?? "unstated";
  const matched = all.filter((o) => (!q || `${o.title} ${o.employer.name} ${o.locations.join(" ")}`.toLowerCase().includes(q)) && (!sourceId || o.sourceRecords.some((r) => r.sourceId === sourceId)) && (!type || typeOf(o) === type));
  // How many stored jobs are of each type — counted over the whole pool, before the type filter.
  const byType: Record<JobType | "unstated", number> = Object.fromEntries([...JOB_TYPES, "unstated"].map((t) => [t, 0])) as Record<JobType | "unstated", number>;
  for (const o of all) byType[typeOf(o)]++;
  return json({ total: matched.length, offset, byType, opportunities: matched.slice(offset, offset + limit) });
}
