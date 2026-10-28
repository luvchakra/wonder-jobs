import { NextResponse } from "next/server";
import { z } from "zod";
import { careerApplicationStatus } from "@/server/careerSite/client";
import { respond } from "@/server/careerSite/respond";
import { rateLimit } from "@/server/rateLimit";
import { clientAddress } from "@/server/activityWatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The token travels in the body, here and on to WonderStar, so it stays out of every address and log.
const Body = z.object({ token: z.string().max(300), action: z.enum(["view", "withdraw"]).default("view") });

/** An applicant's status page withdraws through here; the page itself reads the status on the server. */
export async function POST(req: Request) {
  const rl = rateLimit(`careers-site:status:${clientAddress(req.headers)}`, { capacity: 30, refillPerSec: 30 / 3600 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests from here. Please try again later." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "We couldn't find that application. Use the link in your email." }, { status: 404 });
  const r = await careerApplicationStatus(parsed.data.token.trim(), parsed.data.action);
  return respond(r, (application) => ({ application }), {
    notFound: "We couldn't find that application. Use the link in your email.",
    failed: "That couldn't be done right now. Please try again in a few minutes.",
  });
}
