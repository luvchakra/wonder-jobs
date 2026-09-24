import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { detect } from "@/server/jobslake/admin";
import { badJson, readJson, send } from "@/server/jobslake/http";

export const runtime = "nodejs";

/** Add Source → Detect. Reads only the URL; the Test step is what proves a source works. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 4_000)) as { url?: unknown } | null;
  if (body === null) return badJson();
  return send(detect(String(body.url ?? "")));
}
