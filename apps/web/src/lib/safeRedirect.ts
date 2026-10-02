/**
 * The only way a `?next=` value becomes a redirect target. Accepts same-origin paths only.
 *
 * `startsWith("/") && !startsWith("//")` is not enough: browsers and the WHATWG URL parser treat
 * `\` as `/` and drop tabs/newlines, so `/\evil.com` and `/<tab>/evil.com` both resolve to
 * `https://evil.com/`. Resolve against a fixed origin and keep the result only if it stayed there.
 */
const BASE = "https://wonderjobs.invalid";

export function safeNextPath(raw: string | null | undefined, fallback = "/app", requirePrefix?: string): string {
  if (!raw || raw.length > 2048 || !raw.startsWith("/")) return fallback;
  // Control characters and backslashes have no business in our own paths.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (requirePrefix && !(url.pathname === requirePrefix || url.pathname.startsWith(`${requirePrefix}/`))) return fallback;
  return path;
}
