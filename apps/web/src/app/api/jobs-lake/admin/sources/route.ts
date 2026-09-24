import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { createSource } from "@/server/jobslake/admin";
import { badJson, json, readJson, send } from "@/server/jobslake/http";
import { listSourceViews, sourceView } from "@/server/jobslake/views";
import { healthBySource } from "@/server/jobslake/core";

export const runtime = "nodejs";

export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ sources: await listSourceViews() });
}

/** Register a source as a Draft. It can't serve candidates until it's tested and activated. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (body === null) return badJson();
  const r = await createSource(body, a.actor);
  if (!r.ok) return send(r);
  return json({ source: await sourceView(r.value, await healthBySource()) }, 201);
}
