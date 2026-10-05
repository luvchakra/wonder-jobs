import { createHmac, timingSafeEqual } from "node:crypto";

/** The app's calls carry the shared secret in `x-wonder-secret`; compared in constant time. */
export function serviceAuthorized(header: string | string[] | null | undefined, secret: string): boolean {
  const given = Array.isArray(header) ? header[0] : header;
  if (!given || !secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Who may watch and drive one cloud session: minted when it opens, handed to the candidate's browser, short-lived. */
export interface StreamClaims {
  cloudId: string;
  tenantId: string;
  /** Unix ms. */
  exp: number;
}

const b64u = (s: Buffer | string) => Buffer.from(s).toString("base64url");
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signStreamToken(claims: StreamClaims, secret: string): string {
  const payload = b64u(JSON.stringify(claims));
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyStreamToken(token: string | null | undefined, secret: string, now = Date.now()): StreamClaims | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = mac(payload, secret);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as StreamClaims;
    if (typeof c.cloudId !== "string" || typeof c.tenantId !== "string" || typeof c.exp !== "number") return null;
    if (c.exp <= now) return null;
    return c;
  } catch {
    return null;
  }
}
