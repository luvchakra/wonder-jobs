import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { requestVerificationReview, verificationOptions, verifyByWorkEmail } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

/** How an Owner can verify the company: by their work email, or by asking WonderStar to review it. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s) => verificationOptions(s, org));
}

/** { method: "email" } verifies by the signed-in work email; { method: "review", note } asks for a review. */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.discriminatedUnion("method", [z.object({ method: z.literal("email") }), z.object({ method: z.literal("review"), note: z.string().max(2000).default("") })]);
  return hiringRoute(req, async (s, b) => (b.method === "email" ? { org: await verifyByWorkEmail(s, org) } : requestVerificationReview(s, org, b.note)), { schema: Body, write: true });
}
