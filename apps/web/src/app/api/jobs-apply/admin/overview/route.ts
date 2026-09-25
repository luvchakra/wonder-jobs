import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { applyOverview } from "@/server/jobsApply/admin";

export const runtime = "nodejs";

/** GET → JobsApply operations overview for platform admins: counts and categories only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json(await applyOverview(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: e instanceof Error ? e.message : "Unavailable", retryable: true } }, { status: 503 });
  }
}
