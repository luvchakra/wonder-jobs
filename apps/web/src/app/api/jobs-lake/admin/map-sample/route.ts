import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { mapSample } from "@/server/jobslake/admin";
import { badJson, readJson, send } from "@/server/jobslake/http";

export const runtime = "nodejs";

/** Apply a mapping to a sample already on screen. No network request. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 512_000)) as { sample?: unknown; mapping?: unknown } | null;
  if (body === null) return badJson();
  return send(mapSample(body.sample, body.mapping));
}
