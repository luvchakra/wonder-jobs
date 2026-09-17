/** Small in-memory token bucket per key. Replace with a shared store for multi-instance deployments. */
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, opts: { capacity: number; refillPerSec: number }) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  b.tokens = Math.min(opts.capacity, b.tokens + ((now - b.updated) / 1000) * opts.refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false as const, retryAfterSec: Math.ceil((1 - b.tokens) / opts.refillPerSec) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true as const };
}
