import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { overviewView } from "@/server/jobslake/views";

export const runtime = "nodejs";

export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await overviewView());
}
