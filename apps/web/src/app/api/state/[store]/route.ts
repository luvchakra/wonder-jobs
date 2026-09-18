import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { isStateStoreName, MAX_STATE_BYTES, stateStore } from "@/server/state";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ store: string }> };

/** GET → the tenant's document for this store (204 when none yet). */
export async function GET(_req: Request, ctx: Ctx) {
  const { store } = await ctx.params;
  if (!isStateStoreName(store)) return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  try {
    const doc = await stateStore.get(tenantId, store);
    if (!doc) return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
    return NextResponse.json(doc, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Load failed" }, { status: 503 });
  }
}

/** PUT { state } → upsert. Body size is capped; the tenant is always the session's. */
export async function PUT(req: Request, ctx: Ctx) {
  const { store } = await ctx.params;
  if (!isStateStoreName(store)) return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const rl = rateLimit(`state:${tenantId}`, { capacity: 120, refillPerSec: 4 });
  if (!rl.ok) return NextResponse.json({ error: "Too many updates" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const text = await req.text();
  if (text.length > MAX_STATE_BYTES) return NextResponse.json({ error: "State too large" }, { status: 413 });
  let body: { state?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("state" in body)) return NextResponse.json({ error: "Missing state" }, { status: 400 });
  try {
    const doc = await stateStore.put(tenantId, store, body.state);
    return NextResponse.json({ version: doc.version, updatedAt: doc.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 503 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { store } = await ctx.params;
  if (!isStateStoreName(store)) return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  await stateStore.remove(tenantId, store);
  return NextResponse.json({ ok: true });
}
