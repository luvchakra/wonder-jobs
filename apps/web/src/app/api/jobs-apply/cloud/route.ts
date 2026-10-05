import { NextResponse } from "next/server";
import { webTenant } from "@/server/jobsApply/http";
import { cloudConfigured } from "@/server/jobsApply/cloud";

export const runtime = "nodejs";

/** GET → whether this deployment has a cloud browser (so Fill for me works without the extension). */
export async function GET(req: Request) {
  const t = await webTenant(req, false);
  if (t instanceof NextResponse) return t;
  return NextResponse.json({ available: cloudConfigured() }, { headers: { "cache-control": "no-store" } });
}
