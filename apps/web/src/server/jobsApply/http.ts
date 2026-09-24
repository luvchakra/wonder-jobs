import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import type { ApiResult } from "./service";
import { bearer } from "./token";

const NO_STORE = { "cache-control": "no-store" };

export function send(r: ApiResult): NextResponse {
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * CSRF (SEC-012): cookie-authenticated writes must come from WonderJobs' own pages. A browser always
 * sends `Origin` on a cross-site POST, and a cross-site form can't send `application/json` without a
 * CORS preflight this app never grants — so both checks together stop a forged request.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/** Cookie session for the web routes: tenant, or a response to return. */
export async function webTenant(req: Request, write: boolean): Promise<string | NextResponse> {
  if (write && !sameOrigin(req)) return fail(403, "FORBIDDEN", "Cross-site request refused.");
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`jobsapply:${session.tenantId}`, { capacity: 120, refillPerSec: 3 });
  if (!rl.ok) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  return session.tenantId;
}

export function helperToken(req: Request): string | null {
  return bearer(req.headers.get("authorization"));
}

export function helperRateLimit(token: string): NextResponse | null {
  const rl = rateLimit(`jobsapply-helper:${token.slice(-24)}`, { capacity: 90, refillPerSec: 3 });
  return rl.ok ? null : NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
}

export async function parse<T extends z.ZodType>(req: Request, schema: T, maxBytes = 1_400_000): Promise<z.infer<T> | NextResponse> {
  const text = await req.text();
  if (text.length > maxBytes) return fail(413, "TOO_LARGE", "Request too large.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, "INVALID", "Invalid JSON.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) return NextResponse.json({ error: { code: "INVALID", message: "Invalid request.", issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400, headers: NO_STORE });
  return r.data;
}
