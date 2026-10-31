import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myThreads, startThread } from "@/server/marketplace/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ listingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/), message: z.string().max(1000), confirmed: z.boolean().optional() });

/** The person's own conversations (as buyer or seller): their Deals. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ threads: await myThreads(s) }));
}

/** The buyer's first message on a listing starts the conversation (their own press; gated, rate-limited, audited). */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => startThread(s, b.listingId, b.message, b.confirmed), { schema: Body, write: true });
}
