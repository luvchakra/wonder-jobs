/**
 * Cross-site request forgery guard for cookie-authenticated API mutations, applied centrally in
 * `proxy.ts`. SameSite=Lax cookies already stop most cross-site POSTs; this closes the rest
 * (same-site sibling hosts, top-level form posts, older browsers) by checking what the browser
 * says about where the request came from.
 *
 * - Safe methods are never blocked.
 * - Requests carrying `Authorization` are bearer-authenticated (extension, cron, webhooks with
 *   signatures, admin tokens): a cross-site page can't attach that header without CORS approval.
 * - `Sec-Fetch-Site: cross-site` is refused; otherwise an `Origin` that isn't this host is refused.
 * - No Origin and no Sec-Fetch-Site (server-to-server callers such as payment webhooks) is allowed;
 *   those routes authenticate by signature, not by cookie.
 */
export function isCrossSiteMutation(method: string, headers: Headers, host: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  if (headers.get("authorization")) return false;
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
