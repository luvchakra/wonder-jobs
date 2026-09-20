import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { signExtensionToken } from "@/server/extensionToken";

export const runtime = "nodejs";

/**
 * GET /api/extension/token
 *
 * Called by the extension's content script *on WonderJobs' own origin*, where
 * the normal session cookie applies. Hands back a short-lived bearer token the
 * extension can then use from an employer's site, where the cookie can't go.
 * Read-only and narrow by construction — see `server/extensionToken.ts`.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`ext-token:${session.tenantId}`, { capacity: 30, refillPerSec: 1 / 30 });
  if (!rl.ok) return NextResponse.json({ error: "Too many token requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  try {
    const { token, expiresAt } = signExtensionToken(session.tenantId);
    return NextResponse.json({ token, expiresAt }, { headers: { "cache-control": "no-store" } });
  } catch {
    // SECRET_ENCRYPTION_KEY isn't set on this deployment: say so rather than returning a token that can't be verified.
    return NextResponse.json({ error: "The extension isn't configured on this deployment.", kind: "not_configured" }, { status: 503 });
  }
}
