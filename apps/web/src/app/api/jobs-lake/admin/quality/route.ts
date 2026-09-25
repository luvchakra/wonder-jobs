import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { coverageView, qualityView } from "@/server/jobslake/views";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  const [quality, coverage] = await Promise.all([qualityView(days), coverageView(days)]);
  return json({ days, quality, coverage });
}
