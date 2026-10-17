import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { ConnectionError, listConnections, saveConnection } from "@/server/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveBody = z.object({ host: z.string().trim().min(3).max(253), email: z.string().trim().min(3).max(254), password: z.string().min(6).max(200) });

/** GET → the candidate's sign-in connections: portal, email, masked password, status. Never a password. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ connections: await listConnections(session.tenantId) }, { headers: { "cache-control": "no-store" } });
}

/** POST { host, email, password } → the candidate adds (or replaces) their own sign-in for a portal. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`connections:${session.tenantId}`, { capacity: 10, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = SaveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the portal, the email you sign in with and its password." }, { status: 400 });
  try {
    const connection = await saveConnection(session.tenantId, { ...parsed.data, createdBy: "candidate" });
    await recordServerAudit(session.tenantId, { actionId: `connection:${connection.host}`, actionType: "portal_connection", event: "portal_connection_saved" });
    return NextResponse.json({ connection }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ConnectionError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "Couldn't save that sign-in right now." }, { status: 503 });
  }
}
