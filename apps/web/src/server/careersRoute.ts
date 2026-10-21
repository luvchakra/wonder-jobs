import { NextResponse } from "next/server";
import type { z } from "zod";
import { HiringError } from "./hiring";
import { siteFromKey, type Site } from "./careers";
import { rateLimit } from "./rateLimit";

/**
 * The one wrapper every public careers route uses. The caller is a career site's own server, which sends the
 * site's secret key as `Authorization: Bearer wjcs_…` (never a browser: the key must not reach one). An unknown
 * or revoked key is a 401. Writes are rate-limited per site; the body is parsed with the route's schema.
 */
export async function careersRoute<T>(req: Request, run: (site: Site, body: T) => Promise<unknown>, opts: { schema?: z.ZodType<T>; write?: boolean } = {}) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const site = await siteFromKey(key).catch(() => null);
  if (!site) return NextResponse.json({ error: "Unknown career site key" }, { status: 401 });
  const rl = rateLimit(`careers:${site.id}:${opts.write ? "w" : "r"}`, opts.write ? { capacity: 20, refillPerSec: 0.2 } : { capacity: 120, refillPerSec: 2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests — try again in a moment." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  let body = undefined as T;
  if (opts.schema) {
    const parsed = opts.schema.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again." }, { status: 400 });
    body = parsed.data;
  }
  try {
    const out = await run(site, body);
    return NextResponse.json(out ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[careers]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
