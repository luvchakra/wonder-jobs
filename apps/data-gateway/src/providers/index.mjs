/**
 * Live prospect providers (WJ-822, docs/PROSPECT_DATA_API.md, A3): official APIs asked only when a search names them.
 * One adapter per provider, each `search(plan, ctx) -> { items, next }` in the contract's shape with its attribution.
 * What they return is passed on and never written to the listings table.
 *
 * Keys never live in this package: the host hands them in per request (`keys()`), and a provider without its key says
 * "needs_setup". A call that fails or passes its time limit says "unavailable". Neither fails the search.
 */
import { createHash } from "node:crypto";
import googlePlaces from "./google-places.mjs";
import podcastIndex from "./podcast-index.mjs";
import youtube from "./youtube.mjs";
import { ProviderError } from "./shared.mjs";

export const LIVE_PROVIDERS = Object.freeze([googlePlaces, youtube, podcastIndex]);
export const providerById = (id) => LIVE_PROVIDERS.find((p) => p.id === id) ?? null;
/** How long one provider's answer to the same request is reused, in hours (0: never kept). An admin setting. */
export const DEFAULT_PROVIDER_CACHE_HOURS = Object.freeze(Object.fromEntries(LIVE_PROVIDERS.map((p) => [p.id, p.defaultCacheHours])));
export const MAX_PROVIDER_CACHE_HOURS = 720;
export const PROVIDER_TIMEOUT_MS = 8000;
const MAX_CACHED = 300;

/** Whether a provider can be asked: every key it needs is set. */
export const providerReady = (p, keys) => p.keys.every((k) => typeof keys?.[k] === "string" && keys[k].trim().length > 0);
/** A provider as GET /v1/prospects/sources lists it. */
export const providerListing = (p, keys) => ({ id: p.id, label: p.label, kinds: [...p.kinds], status: providerReady(p, keys) ? "active" : "needs_setup", paid: p.paid, coverage: [...p.coverage], attribution: p.attribution, termsPending: p.termsPending });

/**
 * Asks providers. `keys()` gives the host's keys (none without it); `fetch` and `timeoutMs` are for tests. Answers
 * are kept in memory per instance for the provider's lifetime setting: they are public provider data keyed by the
 * request, never a tenant's, and a provider whose setting is 0 is never kept.
 */
export function createProviderRunner({ keys, fetch: fetchFn, timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
  const cache = new Map();
  const readKeys = async () => { try { return (await keys?.()) ?? {}; } catch { return {}; } };
  const cacheKey = (p, plan, size, token) => createHash("sha256").update(JSON.stringify([p.id, plan, size, token ?? null])).digest("hex");

  /** A kept answer to this exact request that is still inside the provider's lifetime, or null. */
  function kept(p, plan, size, token, hours, now = Date.now()) {
    if (!(hours > 0)) return null;
    const hit = cache.get(cacheKey(p, plan, size, token));
    return hit && now - hit.at < hours * 3600_000 ? hit.value : null;
  }

  /** One page from one provider: { status: "ok", items, next } or { status: "needs_setup" | "unavailable", reason }. Never throws. */
  async function ask(p, plan, { size, token = null, hours = 0, now = Date.now() }) {
    const k = await readKeys();
    if (!providerReady(p, k)) return { status: "needs_setup", items: [], next: null };
    const hit = kept(p, plan, size, token, hours, now);
    if (hit) return { status: "ok", items: hit.items, next: hit.next, cached: true };
    const abort = new AbortController();
    let timer;
    try {
      const run = p.search(plan, { keys: Object.fromEntries(p.keys.map((n) => [n, k[n].trim()])), fetch: fetchFn ?? globalThis.fetch, signal: abort.signal, size, token, now });
      // A call that loses to the time limit still settles later; its failure is already reported.
      run.catch(() => undefined);
      const late = new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new ProviderError("timeout")); }, timeoutMs); });
      const answer = await Promise.race([run, late]);
      const value = { items: Array.isArray(answer?.items) ? answer.items.slice(0, size) : [], next: typeof answer?.next === "string" && answer.next ? answer.next : null };
      if (hours > 0) {
        if (cache.size >= MAX_CACHED) cache.clear();
        cache.set(cacheKey(p, plan, size, token), { at: now, value });
      }
      return { status: "ok", ...value, cached: false };
    } catch (e) {
      // A reason code only: an error's own text could carry a URL or a provider's words.
      return { status: "unavailable", items: [], next: null, reason: e instanceof ProviderError ? e.reason : "malformed" };
    } finally { clearTimeout(timer); }
  }
  return { ask, kept, keys: readKeys };
}
