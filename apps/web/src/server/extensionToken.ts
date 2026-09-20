import crypto from "node:crypto";

/**
 * Bearer token for the browser extension. The extension can't use the
 * session cookie: it reads WonderJobs data from a content script running on
 * *employers'* sites (greenhouse, lever, …), which is a different origin.
 * So a content script on WonderJobs' own origin — where the normal session
 * cookie works — mints one of these and hands it to the extension.
 *
 * Deliberately narrow: signed with the deployment's own secret, carries only
 * a tenant id and an expiry, is short-lived, and grants read-only access to
 * the autofill endpoints and nothing else. Nothing is stored server-side, so
 * there is no token table to leak; it simply stops verifying when it ages out.
 */
const TTL_SECONDS = 30 * 60;

function secret(): string {
  const s = process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY;
  if (!s) throw new Error("SECRET_ENCRYPTION_KEY is required to sign extension tokens");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

export function signExtensionToken(tenantId: string, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS;
  const payload = `${tenantId}.${expiresAt}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`, expiresAt };
}

/** The tenant a token belongs to, or null when it's malformed, forged or expired. */
export function verifyExtensionToken(token: string, now = Date.now()): { tenantId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return null;
  const tenantId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (!tenantId || !Number.isFinite(expiresAt)) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (expiresAt <= Math.floor(now / 1000)) return null;
  return { tenantId };
}

/** Route helper: the tenant from an `Authorization: Bearer …` header, or null. */
export function tenantFromAuthHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  return verifyExtensionToken(match[1])?.tenantId ?? null;
}
