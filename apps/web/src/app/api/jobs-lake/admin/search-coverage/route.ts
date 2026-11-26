import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { coverageView } from "@/server/jobslake/coverage";

export const runtime = "nodejs";

/** Search coverage (platform admins): the latest weekly probes and candidates' thinnest searches. Reads only. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14));
  return json({ coverage: await coverageView(days) });
}
