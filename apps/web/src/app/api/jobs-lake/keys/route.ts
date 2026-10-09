import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { recordServerAudit } from "@/server/audit";
import { rateLimit } from "@/server/rateLimit";
import { ApiKeyError, createApiKey, listApiKeys } from "@/server/jobslake/developer";

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };
const Body = z.object({ name: z.string().max(200) }).strict();

function failure(e: unknown, what: string) {
  if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
  console.error(`[jobslake-api] ${what} failed: ${e instanceof Error ? e.message : "unknown"}`);
  return NextResponse.json({ error: "API keys aren't available just now. Try again shortly." }, { status: 503, headers: NO_STORE });
}

/** GET /api/jobs-lake/keys — the signed-in account's own keys, masked (prefix only). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ keys: await listApiKeys(session.tenantId) }, { headers: NO_STORE });
  } catch (e) {
    return failure(e, "list keys");
  }
}

/** POST /api/jobs-lake/keys — create a key. The full key is in this response only; it is never stored or shown again. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!rateLimit(`jlapi:keys:${session.tenantId}`, { capacity: 10, refillPerSec: 0.05 }).ok) return NextResponse.json({ error: "Too many new keys. Try again in a minute." }, { status: 429, headers: NO_STORE });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Name the key." }, { status: 400, headers: NO_STORE });
  try {
    const created = await createApiKey(session.tenantId, parsed.data.name);
    await recordServerAudit(session.tenantId, { actionId: `jlapi-key:${created.apiKey.id}`, actionType: "jobslake_api", event: "key_created", detail: created.apiKey.prefix });
    return NextResponse.json(created, { status: 201, headers: NO_STORE });
  } catch (e) {
    return failure(e, "create key");
  }
}
