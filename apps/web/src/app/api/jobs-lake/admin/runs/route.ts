import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { jobsLakeStore } from "@/server/jobslake/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const u = new URL(req.url);
  const sourceId = u.searchParams.get("sourceId") ?? undefined;
  const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit")) || 200));
  return json({ runs: await jobsLakeStore().listRuns({ sourceId, limit }) });
}
