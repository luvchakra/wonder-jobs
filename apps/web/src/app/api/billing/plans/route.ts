import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { isAdminSession } from "@/server/jobslake/access";
import { getPlansConfig, savePlansConfig } from "@/server/billing/plansConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The plans as configured (prices and limits are public), and whether this account may change them. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ config: await getPlansConfig(), operator: isAdminSession(session) }, { headers: { "cache-control": "no-store" } });
}

/** Operators only (the same list as JobsLake administration): replaces the stored plan configuration. Takes effect on the next request for every account. */
export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!isAdminSession(session)) return NextResponse.json({ error: "Changing plans is limited to operators." }, { status: 403 });
  const rl = rateLimit(`plans:${session.tenantId}`, { capacity: 10, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many changes at once." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send the plan configuration as JSON." }, { status: 400 });
  const config = await savePlansConfig(body, session.email ?? session.tenantId);
  console.info("[plans] configuration changed by", session.email ?? session.tenantId);
  return NextResponse.json({ config });
}
