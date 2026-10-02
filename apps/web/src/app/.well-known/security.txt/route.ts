import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-static";
export const revalidate = 86400;

/** RFC 9116 security.txt: where to report a vulnerability. Expiry rolls forward with each deploy/revalidation. */
export function GET() {
  const base = siteUrl().origin;
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const body = [`Contact: ${base}/security#report`, `Contact: ${base}/#contact`, `Expires: ${expires}`, `Policy: ${base}/security#report`, "Preferred-Languages: en", `Canonical: ${base}/.well-known/security.txt`, ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
