import { randomBytes } from "node:crypto";

/**
 * A unique test address per call, so parallel workers and repeated runs never collide. `wj-e2e-` makes
 * every row these tests create trivially greppable for cleanup or audit, and the domain is one that
 * accepts mail without a real inbox behind it existing (nothing is ever actually sent — see
 * e2e/fixtures/auth.ts, which creates accounts pre-confirmed via the admin API specifically so a
 * confirmation email is never sent to an address nobody reads).
 */
export function uniqueTestEmail(tag = "user"): string {
  const stamp = Date.now();
  const worker = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0";
  const rand = randomBytes(3).toString("hex");
  return `wj-e2e-${tag}-${stamp}-${worker}-${rand}@example.com`.toLowerCase();
}

/** Meets the product's own minimum (PasswordInput requires 8+) without being a recognizable secret. */
export function testPassword(): string {
  return `Wj-${randomBytes(9).toString("hex")}!`;
}
