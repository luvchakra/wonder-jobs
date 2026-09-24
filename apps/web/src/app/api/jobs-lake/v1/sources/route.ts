import { NextResponse } from "next/server";
import { requireAdminOrService } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { listSourcesPublic } from "@/server/jobslake/service";

export const runtime = "nodejs";

/** GET /api/jobs-lake/v1/sources — the registry: access strategy, status and run-derived health. */
export async function GET(req: Request) {
  const caller = await requireAdminOrService(req);
  if (caller instanceof NextResponse) return caller;
  return json({ sources: await listSourcesPublic() });
}
