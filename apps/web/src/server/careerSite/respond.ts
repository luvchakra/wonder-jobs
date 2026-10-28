import { NextResponse } from "next/server";
import type { Result } from "./client";

/** Messages for applicants when WonderStar can't take a request: plain, never the reason behind it. */
export const RETRY_MESSAGE = "Your application couldn't be sent right now. Please try again in a few minutes.";
export const BUSY_MESSAGE = "We're busy right now. Please try again shortly.";

/** A careers API result as this app's own answer to its page: 400 / 409 messages pass through as they are. */
export function respond<T>(r: Result<T>, ok: (data: T) => unknown, opts: { notFound: string; failed?: string }) {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
  switch (r.state) {
    case "ok":
      return json(ok(r.data));
    case "rejected":
      return json({ error: r.message }, r.status);
    case "not_found":
      return json({ error: opts.notFound }, 404);
    case "busy":
      return json({ error: BUSY_MESSAGE }, 429, { "retry-after": String(r.retryAfterSec) });
    default:
      // No key, a wrong key or WonderStar unreachable: the applicant can only try again later.
      return json({ error: opts.failed ?? RETRY_MESSAGE }, 503);
  }
}
