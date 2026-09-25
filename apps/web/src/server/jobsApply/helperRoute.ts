import { NextResponse } from "next/server";
import { fail, helperRateLimit, helperToken, send } from "./http";
import { helperAuth, type HelperCtx } from "./service";

/** Wraps a helper route: bearer session token → the one session it was minted for, or 401. */
export async function withHelper(req: Request, fn: (ctx: HelperCtx) => Promise<NextResponse>): Promise<NextResponse> {
  const token = helperToken(req);
  if (token) {
    const limited = helperRateLimit(token);
    if (limited) return limited;
  }
  try {
    const ctx = await helperAuth(token);
    if (!("session" in ctx)) return send(ctx);
    return await fn(ctx);
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Unavailable.");
  }
}
