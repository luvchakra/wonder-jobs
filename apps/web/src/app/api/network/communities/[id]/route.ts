import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { actOnMember, deleteCommunity, getCommunity, joinCommunity, leaveCommunity, listDiscussions, startDiscussion, updateCommunity } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?sort=active|new|top: the community, and its discussions when the caller may read them. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const raw = new URL(req.url).searchParams.get("sort");
  const sort = raw === "new" || raw === "top" ? raw : "active";
  return hiringRoute(req, async (s) => {
    const community = await getCommunity(s, id);
    return { community, discussions: community.canRead ? await listDiscussions(s, id, sort) : [] };
  });
}

const Act = z.union([
  z.object({ action: z.enum(["join", "leave"]) }),
  z.object({ action: z.literal("member"), member: z.string().max(60), do: z.enum(["approve", "decline", "remove", "ban", "make_moderator", "make_member", "make_owner"]) }),
  // A member's own new discussion (network.post, checked on the server).
  z.object({ action: z.literal("discuss"), title: z.string().max(400), body: z.string().max(16000), confirmed: z.boolean().optional() }),
]);

/** Join or leave, act on a member (moderators), or start a discussion. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "join") return { community: await joinCommunity(s, id) };
      if (b.action === "leave") return leaveCommunity(s, id);
      if (b.action === "member") return actOnMember(s, id, b.member, b.do);
      if (b.action !== "discuss") return null;
      return { discussion: await startDiscussion(s, id, { title: b.title, body: b.body }, b.confirmed) };
    },
    { schema: Act, write: true },
  );
}

const Edit = z.object({ name: z.string().max(200).optional(), about: z.string().max(2000).optional(), rules: z.string().max(4000).optional(), visibility: z.enum(["public", "private"]).optional(), joinPolicy: z.enum(["open", "approval"]).optional() });

/** Edit the community: its owner only. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ community: await updateCommunity(s, id, b) }), { schema: Edit, write: true });
}

/** Delete the community with its discussions: its owner only. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => deleteCommunity(s, id), { write: true });
}
