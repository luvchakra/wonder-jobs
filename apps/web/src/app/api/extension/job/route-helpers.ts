import { NextResponse } from "next/server";
import { PageJobSchema, type PageJob } from "@/server/extension/pageJob";
import { tenantFromAuthHeader } from "@/server/extensionToken";
import { rateLimit } from "@/server/rateLimit";

const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY = 200_000;

/** Bearer token, rate limit and a validated page job — or the response that says why not. */
export async function pageJobRequest(req: Request, bucket: string): Promise<{ tenantId: string; page: PageJob } | NextResponse> {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderWorks again." }, { status: 401, headers: NO_STORE });
  const rl = rateLimit(`${bucket}:${tenantId}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "That page is too large to read." }, { status: 413, headers: NO_STORE });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400, headers: NO_STORE });
  }
  const parsed = PageJobSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "This page doesn't look like a job posting." }, { status: 400, headers: NO_STORE });
  return { tenantId, page: parsed.data };
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
