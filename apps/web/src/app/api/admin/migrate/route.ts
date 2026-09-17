import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { rateLimit } from "@/server/rateLimit";
import { runMigrations } from "@/server/migrate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Operator-only: applies the bundled schema migrations to the given database.
 * Caller must present the deployment's SUPABASE_SERVICE_ROLE_KEY as a bearer
 * token; the database URL is used for this request only and never stored or
 * logged. Only the checked-in migration SQL can run — never arbitrary SQL.
 */
export async function POST(req: Request) {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !given || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = rateLimit("admin:migrate", { capacity: 5, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const body = z.object({ databaseUrl: z.string().url().refine((u) => /^postgres(ql)?:\/\//.test(u), "Must be a postgres:// URL") }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Provide { databaseUrl: 'postgresql://…' }" }, { status: 400 });
  try {
    const result = await runMigrations(body.data.databaseUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Migration failed" }, { status: 502 });
  }
}
