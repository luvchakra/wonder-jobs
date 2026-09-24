import { NextResponse } from "next/server";
import { requireCandidateOrService } from "@/server/jobslake/access";
import { badJson, readJson, send } from "@/server/jobslake/http";
import { parseSearchRequest, runSearch } from "@/server/jobslake/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/jobs-lake/v1/search — Protocol v1 search (spec §33–35). */
export async function POST(req: Request) {
  const caller = await requireCandidateOrService(req);
  if (caller instanceof NextResponse) return caller;
  const body = await readJson(req);
  if (body === null) return badJson();
  const parsed = parseSearchRequest(body);
  if (!parsed.ok) return send(parsed);
  return send(await runSearch(caller, parsed.value, { signal: req.signal }));
}
