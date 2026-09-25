/**
 * SSRF protection for admin-configured source URLs (spec §50) — the URL-level half. The server
 * half (`server/jobslake/safeFetch.ts`) resolves DNS and re-checks every resolved address with
 * `isBlockedAddress`, so a public hostname pointing at a private IP is refused too.
 */

export type DestinationCheck = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data", "instance-data.ec2.internal", "metadata.azure.com"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".home.arpa", ".corp", ".private", ".svc", ".cluster.local"];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Range(n: number, base: string, bits: number) {
  const b = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((b & mask) >>> 0);
}

/** True for any address a server-side fetch must never reach. Accepts IPv4 or IPv6 text. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return V4_BLOCKED.some(([base, bits]) => inV4Range(v4, base, bits));
  if (!ip.includes(":")) return false;
  // IPv4-mapped / -compatible IPv6: judge the embedded IPv4.
  const mapped = ip.match(/^(?:0*:)*(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::" || ip === "::1" || /^0*(:0*)*:0*1?$/.test(ip)) return true; // unspecified / loopback spellings
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (ip.startsWith("64:ff9b:")) return true; // NAT64 — can reach IPv4 private space
  if (ip.startsWith("2001:db8:")) return true; // documentation
  return false;
}

/**
 * URL-level checks for a source endpoint an administrator typed in. HTTPS only, default port, no
 * embedded credentials, and nothing that names the local machine, an internal network or a cloud
 * metadata service.
 */
export function checkDestination(raw: string): DestinationCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https:// sources are allowed." };
  if (url.username || url.password) return { ok: false, reason: "Put credentials in the credential field, not in the URL." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Only the default HTTPS port is allowed." };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "The URL has no host." };
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "That destination is internal and can't be used as a source." };
  const bare = host.replace(/^\[|\]$/g, "");
  if (ipv4ToInt(bare) !== null || bare.includes(":")) {
    if (isBlockedAddress(bare)) return { ok: false, reason: "That address is private, local or reserved." };
    return { ok: false, reason: "Use the source's hostname, not an IP address." };
  }
  if (!host.includes(".")) return { ok: false, reason: "Single-label hostnames (internal service names) aren't allowed." };
  return { ok: true, url };
}
