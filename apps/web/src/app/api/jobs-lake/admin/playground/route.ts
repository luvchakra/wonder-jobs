import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { playground } from "@/server/jobslake/admin";
import { badJson, json, readJson, send } from "@/server/jobslake/http";
import { rateLimit } from "@/server/rateLimit";
import { err, parseSearchRequest } from "@/server/jobslake/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Admin search: the full response (raw per-source messages) plus the plan, recorded as playground runs. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  if (!rateLimit(`jl:playground:${a.actor}`, { capacity: 20, refillPerSec: 0.2 }).ok) return send(err(429, "RATE_LIMITED", "Too many playground searches. Try again shortly."));
  const body = await readJson(req);
  if (body === null) return badJson();
  const parsed = parseSearchRequest(body);
  if (!parsed.ok) return send(parsed);
  return json(await playground(parsed.value, a.actor));
}
