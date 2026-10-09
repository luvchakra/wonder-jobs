import { NextResponse } from "next/server";
import { developerCaller, hasServiceToken, jlError, type Caller } from "@/server/jobslake/access";
import { jobsLakeFlags } from "@/server/jobslake/flags";
import { readJson } from "@/server/jobslake/http";
import { handleMcp } from "@/server/jobslake/mcp";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/jobs-lake/mcp — the optional MCP adapter (Streamable HTTP, JSON responses). Off unless
 * JOBSLAKE_MCP_ENABLED is set, and every call needs the JOBSLAKE_MCP_TOKEN bearer token or a
 * JobsLake API key (`Authorization: Bearer jl_live_…` or `x-api-key`). A key gets search_jobs,
 * get_job and refresh_job, metered like REST.
 */
export async function POST(req: Request) {
  if (!jobsLakeFlags().jobsLakeMcpEnabled) return jlError("FEATURE_DISABLED", "The JobsLake MCP interface is turned off.", 404);
  let caller: Caller;
  if (hasServiceToken(req)) caller = { kind: "service" };
  else {
    const dev = await developerCaller(req);
    if (dev instanceof NextResponse) return dev;
    if (!dev) return jlError("UNAUTHORIZED", "A JobsLake API key or service token is required.", 401);
    caller = dev;
  }
  const body = await readJson(req, 64_000);
  if (body === null) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  const batch = Array.isArray(body) ? body : [body];
  if (batch.length > 10) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch too large" } }, { status: 400 });
  const replies = (await Promise.all(batch.map((m) => handleMcp(m, caller)))).filter((r) => r !== null);
  if (!replies.length) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { "cache-control": "no-store" } });
}

/** No server-initiated stream: this server only answers requests. */
export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
