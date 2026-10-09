import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { isAdminSession } from "@/server/jobslake/access";
import { getPlansConfig } from "@/server/billing/plansConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The plans as configured (prices and limits are public), and whether this account may change them.
 * Changes are made in Platform → Billing (/api/billing/admin/*), where every save is audited.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ config: await getPlansConfig(), operator: isAdminSession(session) }, { headers: { "cache-control": "no-store" } });
}
