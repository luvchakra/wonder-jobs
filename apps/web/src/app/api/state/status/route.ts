import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/server/supabase";
import { requireSession } from "@/server/auth";

export const runtime = "nodejs";

/** Tells the client whether state is persisted to the database or only locally. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ backend: isSupabaseConfigured() ? "supabase" : "local" }, { headers: { "cache-control": "no-store" } });
}
