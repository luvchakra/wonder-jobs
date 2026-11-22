import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { editPost, follow, moderate, readDiscussion, removePost, replyTo, reportPost, vote } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A discussion with all its replies (reading it marks it read). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => readDiscussion(s, id));
}

const Act = z.union([
  // The caller's own reply (network.post, checked on the server), audited without the words.
  z.object({ action: z.literal("reply"), body: z.string().max(8000), parentId: z.string().max(60).nullable().optional(), confirmed: z.boolean().optional() }),
  // `target` is the discussion itself or one of its replies.
  z.object({ action: z.literal("vote"), target: z.string().max(60), value: z.union([z.literal(1), z.literal(-1), z.literal(0)]), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("edit"), target: z.string().max(60), title: z.string().max(400).optional(), body: z.string().max(16000) }),
  z.object({ action: z.literal("report"), target: z.string().max(60), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal("follow"), on: z.boolean() }),
  z.object({ action: z.literal("moderate"), pinned: z.boolean().optional(), locked: z.boolean().optional() }),
]);

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "reply") return { reply: await replyTo(s, id, { body: b.body, parentId: b.parentId ?? null }, b.confirmed) };
      if (b.action === "vote") return vote(s, b.target, b.value, b.confirmed);
      if (b.action === "edit") return editPost(s, b.target, { title: b.title, body: b.body });
      if (b.action === "report") return reportPost(s, b.target, b.reason);
      if (b.action === "follow") return follow(s, id, b.on);
      return moderate(s, id, { pinned: b.pinned, locked: b.locked });
    },
    { schema: Act, write: true },
  );
}

/** ?target=: remove the discussion, or a reply in it (its author or a moderator). */
export async function DELETE(req: Request) {
  const target = (new URL(req.url).searchParams.get("target") ?? "").slice(0, 60);
  return hiringRoute(req, (s) => removePost(s, target), { write: true });
}
