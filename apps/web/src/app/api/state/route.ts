import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { isStateStoreName, MAX_BATCH_BYTES, MAX_STATE_BYTES, stateStore, type StateStoreName } from "@/server/state";

export const runtime = "nodejs";

/** GET → every store document of the tenant in one response: `{ docs: { [store]: { state, version, updatedAt } } }`. */
export async function GET() {
  const { tenantId } = await getSession();
  try {
    const docs = await stateStore.getAll(tenantId);
    return NextResponse.json({ docs }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Load failed" }, { status: 503 });
  }
}

/** PUT { docs: { [store]: state } } → upsert all in one round trip. Unknown stores are rejected. */
export async function PUT(req: Request) {
  const { tenantId } = await getSession();
  const rl = rateLimit(`state:${tenantId}`, { capacity: 120, refillPerSec: 4 });
  if (!rl.ok) return NextResponse.json({ error: "Too many updates" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const text = await req.text();
  if (text.length > MAX_BATCH_BYTES) return NextResponse.json({ error: "State too large" }, { status: 413 });
  let body: { docs?: Record<string, unknown> };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !body.docs || typeof body.docs !== "object") return NextResponse.json({ error: "Missing docs" }, { status: 400 });
  const docs: Partial<Record<StateStoreName, unknown>> = {};
  for (const [name, state] of Object.entries(body.docs)) {
    if (!isStateStoreName(name)) return NextResponse.json({ error: `Unknown store ${name}` }, { status: 400 });
    if (JSON.stringify(state).length > MAX_STATE_BYTES) return NextResponse.json({ error: `${name} is too large` }, { status: 413 });
    docs[name] = state;
  }
  if (!Object.keys(docs).length) return NextResponse.json({ saved: {} });
  try {
    const saved = await stateStore.putMany(tenantId, docs);
    return NextResponse.json({ saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 503 });
  }
}
