import { lookup } from "node:dns/promises";
import { checkDestination, isBlockedAddress } from "@/domain/jobslake/ssrf";

/**
 * Outbound fetch for admin-configured source URLs (spec §50): URL checks, DNS resolution with every
 * resolved address re-checked, redirects followed manually (each hop re-validated), a timeout, and
 * a response-size cap. Credentials passed in `headers` are never echoed into errors.
 *
 * Known limit, stated plainly: Node's fetch resolves the host again when it connects, so a DNS
 * answer that changes between our check and the connection (rebinding) isn't fully excluded here.
 * Production should also route source traffic through an egress proxy that enforces the same
 * policy — this function is the application-level guard, not the whole network policy.
 */
export class DestinationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DestinationBlockedError";
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  maxRedirects?: number;
}

async function assertPublic(raw: string): Promise<URL> {
  const check = checkDestination(raw);
  if (!check.ok) throw new DestinationBlockedError(check.reason);
  let addresses: { address: string }[];
  try {
    addresses = await lookup(check.url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`${check.url.hostname} could not be resolved`);
  }
  if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) throw new DestinationBlockedError(`${check.url.hostname} resolves to a private or reserved address.`);
  return check.url;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<{ status: number; contentType: string; text: string; finalUrl: string; headers: Headers }> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  let url = await assertPublic(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { method: opts.method ?? "GET", body: opts.body, headers: { "user-agent": "JobsLake/1.0 (+https://wonderjobs-wonder-team4.vercel.app)", accept: "application/json, application/xml, text/xml, text/html;q=0.8", ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) }, redirect: "manual", signal, cache: "no-store" });
    } catch (e) {
      if (signal.aborted) throw new Error(`No response within ${Math.round(timeoutMs / 1000)}s`);
      throw new Error(`${url.hostname} could not be reached${e instanceof Error && e.message ? ` (${e.message.slice(0, 80)})` : ""}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= (opts.maxRedirects ?? 3)) throw new Error("Too many redirects");
      url = await assertPublic(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error(`Response too large (${Math.round(declared / 1024)} KB, limit ${Math.round(maxBytes / 1024)} KB)`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error(`Response too large (over ${Math.round(maxBytes / 1024)} KB)`);
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", text, finalUrl: url.toString(), headers: res.headers };
  }
}
