/**
 * A public JSON feed read politely for Events: one request with a User-Agent that names us, the answer cut down to what
 * Events keeps and held in this process for a while (so many searches make one request), and a failed read never kept. Shared
 * by sources that read a public feed directly (developers.events today); a feed that needs a key or a
 * licence has its own file.
 */
const kept = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export const FEED_USER_AGENT = "WonderWorks/1.0 (+https://works.wonderapps.biz; events directory; reads each public feed at most every few hours)";

/**
 * `headers` are extra request headers (a source's key goes here, never in the URL); they are not part of what a read is kept
 * under, so two keys read the same public list once.
 */
export async function readFeed<T>(url: string, o: { ttlMs: number; timeoutMs: number; name: string; keep: (json: unknown) => T; headers?: Record<string, string> }, now = Date.now()): Promise<T> {
  const hit = kept.get(url);
  if (hit && now - hit.at < o.ttlMs) return hit.value as T;
  let run = inflight.get(url) as Promise<T> | undefined;
  if (!run) {
    run = (async () => {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": FEED_USER_AGENT, ...o.headers }, signal: AbortSignal.timeout(o.timeoutMs) });
      // Never the URL or headers (a key may be in them): the status only.
      if (res.status === 401 || res.status === 403) throw new Error(`${o.name} refused the request (${res.status}).`);
      if (res.status === 429) throw new Error(`${o.name} is rate limited right now.`);
      if (!res.ok) throw new Error(`${o.name} answered ${res.status}.`);
      const value = o.keep((await res.json()) as unknown);
      kept.set(url, { at: now, value });
      return value;
    })().finally(() => inflight.delete(url));
    inflight.set(url, run);
  }
  return run;
}

/** For tests: forget everything read. */
export const forgetFeeds = () => {
  kept.clear();
  inflight.clear();
};
