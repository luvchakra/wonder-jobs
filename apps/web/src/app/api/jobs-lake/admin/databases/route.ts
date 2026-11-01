import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { databasesReport } from "@/server/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Usage and performance of the application database (ADB) and the optional data database (DDB). Admin only, read-only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await databasesReport());
}
