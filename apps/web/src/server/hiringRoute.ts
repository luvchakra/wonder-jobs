import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireSession, type Session } from "./auth";
import { HiringError } from "./hiring";
import { rateLimit } from "./rateLimit";

/**
 * The one wrapper every hiring route uses: a signed-in session (401 otherwise), a rate limit on writes, a parsed
 * body, and the hiring module's own errors as their status. The permission checks themselves live in
 * `server/hiring.ts`, never here.
 */
export async function hiringRoute<T>(req: Request, run: (s: Session, body: T) => Promise<unknown>, opts: { schema?: z.ZodType<T>; write?: boolean } = {}) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (opts.write) {
    const rl = rateLimit(`hiring:${session.tenantId}`, { capacity: 30, refillPerSec: 0.5 });
    if (!rl.ok) return NextResponse.json({ error: "Too many changes at once — wait a moment." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  }
  let body = undefined as T;
  if (opts.schema) {
    const parsed = opts.schema.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again." }, { status: 400 });
    body = parsed.data;
  }
  try {
    const out = await run(session, body);
    return NextResponse.json(out ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[hiring]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
