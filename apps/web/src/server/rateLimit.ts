/**
 * Small in-memory token bucket per key.
 *
 * Per server instance: limits are a floor, not a global guarantee, on a multi-instance deployment
 * (replace with a shared store such as Redis to make them global). The map is bounded — idle
 * buckets are swept, and past `MAX_KEYS` the oldest are evicted — so attacker-chosen keys (random
 * tokens, spoofed addresses) can't grow memory without limit.
 */
const buckets = new Map<string, { tokens: number; updated: number }>();
export const MAX_KEYS = 50_000;
const IDLE_MS = 15 * 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000 && buckets.size < MAX_KEYS) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now - b.updated > IDLE_MS) buckets.delete(k);
  // Still too many: Map iterates in insertion order, so the first keys are the oldest.
  for (const k of buckets.keys()) {
    if (buckets.size < MAX_KEYS) break;
    buckets.delete(k);
  }
}

export function rateLimit(key: string, opts: { capacity: number; refillPerSec: number }) {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  b.tokens = Math.min(opts.capacity, b.tokens + ((now - b.updated) / 1000) * opts.refillPerSec);
  b.updated = now;
  // Re-insert so recently used keys move to the end (least recently used are evicted first).
  buckets.delete(key);
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false as const, retryAfterSec: Math.ceil((1 - b.tokens) / opts.refillPerSec) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true as const };
}

/** Tests. */
export function rateLimitKeyCount() {
  return buckets.size;
}
