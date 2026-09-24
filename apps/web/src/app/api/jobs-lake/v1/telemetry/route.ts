import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCandidateOrService, jlError } from "@/server/jobslake/access";
import { json, readJson } from "@/server/jobslake/http";
import { rateLimit } from "@/server/rateLimit";
import { jobsLakeStore } from "@/server/jobslake/store";

export const runtime = "nodejs";

const Body = z.object({
  requestId: z.string().regex(/^req_[\w-]{6,40}$/),
  bySource: z.record(z.string().max(80), z.object({ relevant: z.number().int().min(0).max(5000), strong: z.number().int().min(0).max(5000) })).refine((r) => Object.keys(r).length <= 60),
});

/**
 * POST /api/jobs-lake/v1/telemetry — after WonderJobs scores a search, it reports how many results
 * from each source were relevant / strong matches (spec §63). Counts only — never which jobs, never
 * anything about the candidate.
 */
export async function POST(req: Request) {
  const caller = await requireCandidateOrService(req);
  if (caller instanceof NextResponse) return caller;
  const key = caller.kind === "candidate" ? caller.tenantId : caller.kind;
  if (!rateLimit(`jl:telemetry:${key}`, { capacity: 30, refillPerSec: 0.5 }).ok) return jlError("RATE_LIMITED", "Too many reports.", 429);
  const p = Body.safeParse(await readJson(req));
  if (!p.success) return jlError("INVALID_REQUEST", "Expected { requestId, bySource: { [sourceId]: { relevant, strong } } }.", 400);
  await jobsLakeStore().recordContribution(p.data.requestId, p.data.bySource);
  return json({ ok: true });
}
