import { NextResponse } from "next/server";
import type { z } from "zod";
import { HiringError } from "./hiring";
import { hostedSite, type Site } from "./careers";
import { rateLimit } from "./rateLimit";
import { clientAddress } from "./activityWatch";

/**
 * The wrapper for careers pages WonderJobs hosts (/careers/<slug>). The visitor is a job seeker in a browser, so
 * there is no key: these routes reach only a hosted site found by its short name, and through it only its own
 * company's open, linked jobs (the same functions the keyed API uses). Writes are rate-limited per visitor
 * address and per site; cross-site posts are refused by the proxy (CSRF).
 */
export async function hostedCareersRoute<T>(req: Request, slug: string, run: (site: Site, body: T) => Promise<unknown>, opts: { schema: z.ZodType<T>; perHour: number }) {
  const site = await hostedSite(slug).catch(() => null);
  if (!site) return NextResponse.json({ error: "This careers page doesn't exist." }, { status: 404 });
  const ip = clientAddress(req.headers);
  const perIp = rateLimit(`hosted:${site.id}:${ip}`, { capacity: opts.perHour, refillPerSec: opts.perHour / 3600 });
  const perSite = rateLimit(`hosted:${site.id}`, { capacity: 60, refillPerSec: 60 / 3600 });
  if (!perIp.ok || !perSite.ok) return NextResponse.json({ error: "Too many requests from here. Please try again later." }, { status: 429, headers: { "retry-after": String(Math.max(perIp.retryAfterSec ?? 0, perSite.retryAfterSec ?? 0)) } });
  const parsed = opts.schema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again." }, { status: 400 });
  try {
    return NextResponse.json((await run(site, parsed.data)) ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[careers:hosted]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
