import { NextResponse } from "next/server";
import { requireAdminOrService } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { healthPublic } from "@/server/jobslake/service";

export const runtime = "nodejs";

/** GET /api/jobs-lake/v1/health — per-source health computed from recorded runs only. */
export async function GET(req: Request) {
  const caller = await requireAdminOrService(req);
  if (caller instanceof NextResponse) return caller;
  return json(await healthPublic());
}
