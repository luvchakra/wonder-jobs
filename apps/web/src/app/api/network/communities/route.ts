import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { createCommunity, listCommunities } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=: the caller's communities, and public ones to discover (matching the words, when given). */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  return hiringRoute(req, (s) => listCommunities(s, q));
}

const Create = z.object({ name: z.string().max(200), about: z.string().max(2000).optional(), rules: z.string().max(4000).optional(), visibility: z.enum(["public", "private"]).optional(), joinPolicy: z.enum(["open", "approval"]).optional(), confirmed: z.boolean().optional() });

/** Start a community (network.post, checked on the server); the caller becomes its owner. */
export async function POST(req: Request) {
  return hiringRoute(req, async (s, b) => ({ community: await createCommunity(s, b, b.confirmed) }), { schema: Create, write: true });
}
