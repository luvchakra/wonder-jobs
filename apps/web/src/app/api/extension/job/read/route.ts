import { NextResponse } from "next/server";
import { readPageJob } from "@/server/extension/pageJob";
import { json, pageJobRequest } from "../route-helpers";

export const runtime = "nodejs";

/**
 * POST /api/extension/job/read — bearer token from `/api/extension/token`.
 *
 * The job on the page the candidate has open (read by the side panel when they asked), scored against
 * their own Career DNA, with its Pipeline status when they already have it. Reads only.
 */
export async function POST(req: Request) {
  const r = await pageJobRequest(req, "ext-job-read");
  if (r instanceof NextResponse) return r;
  return json(await readPageJob(r.tenantId, r.page));
}
