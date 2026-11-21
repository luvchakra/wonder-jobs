import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { addComment, commentsOn, deleteComment, react, reportComment, resharePost } from "@/server/network/engage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** The comments on a post the caller can see. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s) => ({ comments: await commentsOn(s, id) }));
}

const Body = z.union([
  // A reaction, or null to take it back.
  z.object({ action: z.literal("react"), reaction: z.enum(["like", "celebrate", "support", "insightful"]).nullable(), confirmed: z.boolean().optional() }),
  // The caller's own comment (network.post, checked on the server), audited without the words.
  z.object({ action: z.literal("comment"), body: z.string().min(1).max(2000), confirmed: z.boolean().optional() }),
  // Reshare a post for everyone, with the caller's own words or none.
  z.object({ action: z.literal("reshare"), text: z.string().max(4000).optional(), audience: z.enum(["connections", "everyone"]).optional(), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("reportComment"), comment: z.string().max(60), reason: z.string().min(3).max(500) }),
]);

/** React, comment, reshare, or report a comment on a post the caller can see. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "react") return react(s, id, b.reaction, b.confirmed);
      if (b.action === "comment") return { comment: await addComment(s, id, b.body, b.confirmed) };
      if (b.action === "reshare") return resharePost(s, id, { text: b.text, audience: b.audience }, b.confirmed);
      return reportComment(s, b.comment, b.reason);
    },
    { schema: Body, write: true },
  );
}

/** ?comment=: remove the caller's own comment, or one on their own post. */
export async function DELETE(req: Request) {
  const comment = (new URL(req.url).searchParams.get("comment") ?? "").slice(0, 60);
  return hiringRoute(req, (s) => deleteComment(s, comment), { write: true });
}
