import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/server/supabase";
import { getSession } from "@/server/auth";

export const runtime = "nodejs";

/** Tells the client whether state is persisted to the database or only locally. */
export async function GET() {
  await getSession(); // establishes the tenant cookie early
  return NextResponse.json({ backend: isSupabaseConfigured() ? "supabase" : "local" }, { headers: { "cache-control": "no-store" } });
}
