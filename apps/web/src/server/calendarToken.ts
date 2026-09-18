import crypto from "node:crypto";

/**
 * Signs a tenant id for the public, cookie-less calendar feed URL (calendar apps poll it on their own
 * schedule, with no browser session). HMAC over the deployment's own secret, not stored anywhere — the
 * URL itself is the credential, same pattern as a signed download link. Keep it as secret as a password.
 */
function secret() {
  const s = process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY;
  if (!s) throw new Error("SECRET_ENCRYPTION_KEY is required to sign calendar feed links");
  return s;
}

export function signTenantForCalendar(tenantId: string): string {
  return crypto.createHmac("sha256", secret()).update(tenantId).digest("hex").slice(0, 32);
}

export function verifyTenantCalendarSignature(tenantId: string, signature: string): boolean {
  const expected = signTenantForCalendar(tenantId);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
