import { NextResponse } from "next/server";
import { currentAdmin } from "@/server/jobslake/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether the signed-in account is a platform admin (JOBSLAKE_ADMIN_EMAILS, admin portal on), so the
 * avatar menu can show its Admin link. Only a yes/no — the portal and its API check again on every request.
 */
export async function GET() {
  return NextResponse.json({ admin: !!(await currentAdmin()) }, { headers: { "cache-control": "no-store" } });
}
