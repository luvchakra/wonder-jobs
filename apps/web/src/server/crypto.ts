import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison that also hides the length of the expected
 * value: both sides are hashed to a fixed width before `timingSafeEqual`.
 */
export function safeEqual(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && given.length === expected.length;
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** `Authorization: Bearer <token>` checked against a configured secret. False when the secret is unset. */
export function bearerMatches(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(given, expected);
}
