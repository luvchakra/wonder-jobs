import { NextResponse } from "next/server";
import { savePageJob } from "@/server/extension/pageJob";
import { json, pageJobRequest } from "../route-helpers";

export const runtime = "nodejs";

/**
 * POST /api/extension/job/save — bearer token from `/api/extension/token`.
 *
 * The candidate pressed Save in the side panel: the job joins their saved jobs and Pipeline (Saved).
 * Saving the same posting again changes nothing.
 */
export async function POST(req: Request) {
  const r = await pageJobRequest(req, "ext-job-save");
  if (r instanceof NextResponse) return r;
  const saved = await savePageJob(r.tenantId, r.page);
  return json(saved, saved.created ? 201 : 200);
}
