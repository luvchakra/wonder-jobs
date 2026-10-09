import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { rateLimit } from "@/server/rateLimit";
import { AdminBillingError } from "./admin";

/**
 * Every billing-admin route: platform admins only (403 for anyone else signed in, 404 when the admin
 * portal is off), changes rate-limited per admin, errors in fixed words — never a provider's own text.
 */
export async function billingAdminRoute(req: Request, run: (actor: string, body: unknown) => Promise<unknown>, okStatus = 200): Promise<NextResponse> {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const write = req.method !== "GET";
  if (write && !rateLimit(`billing-admin:${a.actor}`, { capacity: 20, refillPerSec: 0.2 }).ok) return err(429, "RATE_LIMITED", "Too many changes at once. Try again shortly.");
  let body: unknown = undefined;
  if (write) {
    body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "INVALID_REQUEST", "Send the change as JSON.");
  }
  try {
    return NextResponse.json(await run(a.actor, body), { status: okStatus, headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AdminBillingError) return err(e.status, e.code, e.message);
    console.error(`[billing-admin] ${req.method} ${new URL(req.url).pathname} failed: ${e instanceof Error ? e.name : "unknown"}`);
    return err(500, "INTERNAL", "Something went wrong; nothing was confirmed. Check History before retrying.");
  }
}

function err(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, retryable: status === 429 || status >= 502 } }, { status, headers: { "cache-control": "no-store" } });
}
