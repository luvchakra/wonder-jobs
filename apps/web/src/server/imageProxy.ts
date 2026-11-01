import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKey } from "./secrets";

/**
 * Outside images through WonderWorks' own origin (owner, 2026-11-01: "add an image proxy for outside product images").
 * The page's CSP allows images only from our origin, so a shop's product photo is shown as /api/img?u=…&s=…: the server
 * signs every URL it hands out, and the proxy serves only signed ones, so it can't be used as an open proxy. The fetch
 * goes through safeFetch (public addresses only, redirects re-checked), and only images, under a size cap, come back.
 */
// A purpose-specific key (HKDF from the master secret), so this signature can't stand in for any other token.
const key = () => derivedKey("wonderworks/image-proxy/hmac/v1");

const sign = (url: string) => createHmac("sha256", key()).update(url).digest("base64url").slice(0, 32);

/** Our URL for an outside image, or undefined when the image isn't a public https URL. */
export function proxiedImage(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 2000) return undefined;
  let u: URL;
  try {
    u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password) return undefined;
  const url = u.toString();
  return `/api/img?u=${encodeURIComponent(url)}&s=${sign(url)}`;
}

/** Whether `s` is our signature for `url` (constant-time). */
export function verifyImage(url: string, s: string): boolean {
  const want = Buffer.from(sign(url));
  const got = Buffer.from(String(s));
  return want.length === got.length && timingSafeEqual(want, got);
}

export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
