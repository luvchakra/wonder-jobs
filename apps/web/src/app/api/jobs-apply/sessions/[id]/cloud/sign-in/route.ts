import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, send, webTenant } from "@/server/jobsApply/http";
import { signInCloud } from "@/server/jobsApply/cloud";
import { rateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 45;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("sign_in") }),
  z.object({ mode: z.literal("create") }),
  z.object({ mode: z.literal("save"), email: z.string().trim().min(3).max(254), password: z.string().min(6).max(200) }),
]);

/**
 * POST → the candidate pressed "Sign in" / "Create an account for me" / saved their own sign-in for this
 * application's portal (WJ-316). The password never comes back in the response.
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const rl = rateLimit(`portal-signin:${t}`, { capacity: 6, refillPerSec: 0.05 });
  if (!rl.ok) return fail(429, "RATE_LIMITED", "Too many sign-in attempts. Try again in a few minutes.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "INVALID", "Enter the email and password you sign in with.");
  const { id } = await ctx.params;
  try {
    return send(await signInCloud(t, id, parsed.data));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't sign in right now.");
  }
}
