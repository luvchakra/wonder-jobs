import { describe, expect, it } from "vitest";
import { MAX_KEYS, rateLimit, rateLimitKeyCount } from "./rateLimit";

describe("rateLimit", () => {
  it("allows the capacity, then refuses", () => {
    const opts = { capacity: 3, refillPerSec: 0.0001 };
    expect([1, 2, 3, 4].map(() => rateLimit("rl-test:a", opts).ok)).toEqual([true, true, true, false]);
  });

  it("stays bounded when flooded with distinct keys", () => {
    for (let i = 0; i < MAX_KEYS + 5_000; i++) rateLimit(`rl-flood:${i}`, { capacity: 1, refillPerSec: 1 });
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(MAX_KEYS);
  });

  it("evicts the least recently used keys, so a busy caller keeps its limit through a flood", () => {
    expect(rateLimit("rl-busy", { capacity: 1, refillPerSec: 0.001 }).ok).toBe(true);
    for (let i = 0; i < MAX_KEYS + 5_000; i++) {
      rateLimit(`rl-flood2:${i}`, { capacity: 1, refillPerSec: 1 });
      if (i % 1_000 === 0) rateLimit("rl-busy", { capacity: 1, refillPerSec: 0.001 });
    }
    expect(rateLimit("rl-busy", { capacity: 1, refillPerSec: 0.001 }).ok).toBe(false);
  });
});
