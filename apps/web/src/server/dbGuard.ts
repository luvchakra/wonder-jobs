/**
 * Safeguards between the app and the database (owner, 2026-11-01: "add safeguards so the db doesn't go down again").
 *
 * On 2026-11-01 one admin page fired ~2,750 database requests at once; the free-plan database stopped answering and
 * needed a manual restart. Every server-side Supabase request now goes through this fetch, which:
 *  - caps the requests in flight per server instance (the rest wait their turn, in order);
 *  - refuses at once when too many are already waiting, instead of queueing without limit;
 *  - gives every request a deadline, so a hung database doesn't pile up open requests;
 *  - backs off when the database is failing: after several failures in a row it answers "busy" without calling it
 *    for a short cool-down, then lets one request through to test it (a circuit breaker).
 * A refusal is an ordinary 503 response, so callers see a normal Supabase error and say "Unavailable" as they already do.
 */

export interface DbGuardLimits {
  /** Requests in flight at once, per server instance. */
  maxConcurrent: number;
  /** Requests allowed to wait for a slot; beyond this, refuse at once. */
  maxQueue: number;
  /** A request's deadline, in ms. */
  timeoutMs: number;
  /** Failures in a row that open the breaker. */
  failuresToOpen: number;
  /** How long the breaker stays open before letting one test request through, in ms. */
  coolDownMs: number;
}

export const DB_GUARD_DEFAULTS: DbGuardLimits = { maxConcurrent: 12, maxQueue: 400, timeoutMs: 20_000, failuresToOpen: 5, coolDownMs: 20_000 };

/** Status codes that mean the database (or its gateway) is struggling, not that the request was wrong. */
const OVERLOAD = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const busy = (message: string) => new Response(JSON.stringify({ message, code: "DB_BUSY", details: null, hint: null }), { status: 503, headers: { "content-type": "application/json" } });

export function createDbGuard(limits: Partial<DbGuardLimits> = {}, base: typeof fetch = (...a) => fetch(...a), clock: () => number = Date.now) {
  const L = { ...DB_GUARD_DEFAULTS, ...limits };
  let active = 0;
  const waiting: (() => void)[] = [];
  let failures = 0;
  let openUntil = 0;
  let probing = false;
  const stats = { refusedBusy: 0, refusedBreaker: 0, timedOut: 0 };

  const release = () => {
    active--;
    const next = waiting.shift();
    if (next) next();
  };
  const acquire = () =>
    new Promise<void>((resolve) => {
      const go = () => {
        active++;
        resolve();
      };
      if (active < L.maxConcurrent) go();
      else waiting.push(go);
    });

  const guarded: typeof fetch = async (input, init) => {
    // Breaker open: answer at once instead of adding to a database that's already failing.
    let probe = false;
    if (openUntil) {
      if (clock() < openUntil || probing) {
        stats.refusedBreaker++;
        return busy("The database is recovering; try again in a moment.");
      }
      probing = probe = true;
    }
    if (active >= L.maxConcurrent && waiting.length >= L.maxQueue) {
      stats.refusedBusy++;
      if (probe) probing = false;
      return busy("The database is busy; try again in a moment.");
    }
    await acquire();
    const ac = new AbortController();
    const outer = init?.signal;
    const onAbort = () => ac.abort(outer?.reason);
    if (outer?.aborted) ac.abort(outer.reason);
    else outer?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort(new Error("Database request timed out"));
    }, L.timeoutMs);
    try {
      const res = await base(input, { ...init, signal: ac.signal });
      record(!OVERLOAD.has(res.status));
      return res;
    } catch (e) {
      // A caller's own cancel says nothing about the database's health.
      if (!outer?.aborted) record(false);
      if (timedOut) {
        stats.timedOut++;
        return busy("The database didn't answer in time.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
      if (probe) probing = false;
      release();
    }
  };

  function record(ok: boolean) {
    if (ok) {
      failures = 0;
      openUntil = 0;
      return;
    }
    failures++;
    if (failures >= L.failuresToOpen) openUntil = clock() + L.coolDownMs;
  }

  return {
    fetch: guarded,
    /** What the guard is doing now (for the admin and tests). */
    state: () => ({ active, waiting: waiting.length, failures, open: openUntil > 0 && clock() < openUntil, ...stats }),
  };
}

/** The one guard every server-side Supabase request shares (per server instance). */
export const dbGuard = createDbGuard();
