import crypto from "node:crypto";

/**
 * Helper token for one JobsApply session (spec §90). Unlike the general extension token it is:
 *  - candidate-specific (tenant id) AND session-specific (session id);
 *  - revocable: it carries the session's nonce, and Stop/Cancel rotate the nonce, so an issued token
 *    stops working immediately — the route compares it with the stored session on every request;
 *  - short-lived (30 minutes) and grants only that session's helper endpoints.
 * Nothing is stored server-side beyond the nonce already in the session.
 */
const TTL_SECONDS = 30 * 60;
const PREFIX = "jas1";

function secret(): string {
  const s = process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY;
  if (!s) throw new Error("SECRET_ENCRYPTION_KEY is required to sign JobsApply helper tokens");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`jobsapply:${payload}`).digest("base64url");
}

export interface HelperClaims {
  tenantId: string;
  sessionId: string;
  nonce: string;
  expiresAt: number;
}

export function signHelperToken(c: Omit<HelperClaims, "expiresAt">, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(now / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ t: c.tenantId, s: c.sessionId, n: c.nonce, e: expiresAt })).toString("base64url");
  return { token: `${PREFIX}.${payload}.${sign(payload)}`, expiresAt };
}

/** Claims from a well-formed, correctly signed, unexpired token — the caller must still compare the nonce with the session. */
export function verifyHelperToken(token: string, now = Date.now()): HelperClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payload, sig] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null;
  }
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let raw: { t?: unknown; s?: unknown; n?: unknown; e?: unknown };
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof raw.t !== "string" || typeof raw.s !== "string" || typeof raw.n !== "string" || typeof raw.e !== "number") return null;
  if (raw.e <= Math.floor(now / 1000)) return null;
  return { tenantId: raw.t, sessionId: raw.s, nonce: raw.n, expiresAt: raw.e };
}

export function bearer(header: string | null): string | null {
  const m = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return m ? m[1] : null;
}

export function newNonce(): string {
  return crypto.randomBytes(12).toString("base64url");
}
