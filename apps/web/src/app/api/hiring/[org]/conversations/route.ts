import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgConversations, startConversation } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => ({ conversations: await orgConversations(s, org) }));
}

/** A recruiter's first message to a candidate who is open to recruiters. */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ candidate: z.string().min(1).max(120), body: z.string().min(1).max(4000), jobId: z.string().max(80).optional() });
  return hiringRoute(req, async (s, b) => ({ id: await startConversation(s, org, b.candidate, b.body, b.jobId) }), { schema: Body, write: true });
}
